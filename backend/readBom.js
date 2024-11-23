const fs = require('fs');
const pdf = require('pdf-parse');
const xlsx = require('xlsx');
const client = require('./db');

// Function to extract text from PDF
function extractPDFText(filePath) {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, (err, data) => {
            if (err) {
                return reject(err);
            }
            pdf(data).then((data) => {
                resolve(data.text);
            }).catch(err => reject(err));
        });
    });
}

// Function to extract specific part numbers from PDF text
function extractPartsFromPDFText(pdfText) {
    const lines = pdfText.split(/\r?\n/);  // Split PDF text into lines
    const partNumbers = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Pattern to find a part number, only looking at the part after the first dash
        const partPattern = /(?:[A-Z0-9]+-)([A-Z0-9]+[-_\/A-Z0-9]*)/;
        const match = line.match(partPattern);

        if (match && match[1]) {
            const cleanedPart = cleanPartNumber(match[1]);  // Clean the part number
            partNumbers.push(cleanedPart);
        }
    }
    return partNumbers;
}

// Function to clean the part number (skip special characters after the first dash)
function cleanPartNumber(part) {
    // Clean part number by removing any dashes, slashes, or underscores after the first dash
    return part.replace(/[-_.\/\\]/g, '').trim().toUpperCase();
}

// Example usage
const pdfText = `
Cust P/N :80047325 20 53.5800 1,071.60
78-SMBJ28CAHE3_A/I
ESD Protection Diodes / TVS Diodes 600W 28V 5 SMB (DO-214AA)

Cust P/N :80047326 10 188.1600 1,881.60
710-744710210
Power Inductors - Leaded WE-SD Rod Core 2uH 10A 3.8mOhm
`;

const partNumbers = extractPartsFromPDFText(pdfText);
console.log(partNumbers);  // Output: ["SMBJ28CAHE3AI", "744710210"]
// Function to extract part numbers from Excel BOM
function extractPartNumbersFromExcel(filePath) {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const partNumbers = [];
    const range = xlsx.utils.decode_range(worksheet['!ref']);
    const headers = {};
    let partNoColumnIndex = -1;
    const startingRow = 5;

    for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = xlsx.utils.encode_cell({ r: startingRow, c: col });
        const cell = worksheet[cellAddress];
        if (cell) {
            const headerValue = cell.v.trim();
            headers[headerValue] = col;
            if (headerValue === 'MPN') {
                partNoColumnIndex = col;
            }
        }
    }

    if (partNoColumnIndex === -1) {
        throw new Error('MPN column not found in the Excel file.');
    }

    for (let row = startingRow + 1; row <= range.e.r; row++) {
        const partNoCell = worksheet[xlsx.utils.encode_cell({ r: row, c: partNoColumnIndex })];
        if (partNoCell) {
            let partNo = cleanPartNumber(partNoCell.v.toString());
            partNumbers.push(partNo);
        }
    }

    return partNumbers;
}

// Function to get all part details from Excel
function getAllPartDetailsFromExcel(filePath) {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const range = xlsx.utils.decode_range(worksheet['!ref']);
    const headers = {};
    let partNoColumnIndex = -1;
    const startingRow = 5; // Adjust this if your data starts on a different row

    // Get header information
    for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = xlsx.utils.encode_cell({ r: startingRow, c: col });
        const cell = worksheet[cellAddress];
        if (cell) {
            const headerValue = cell.v.trim();
            headers[headerValue] = col;
            if (headerValue === 'MPN') {
                partNoColumnIndex = col;
            }
        }
    }

    if (partNoColumnIndex === -1) {
        console.error('MPN column not found.');
        throw new Error('MPN column not found in the Excel file.');
    }

    const parts = []; // Array to store all parts

    // Read each part
    for (let row = startingRow + 1; row <= range.e.r; row++) {
        const partNoCell = worksheet[xlsx.utils.encode_cell({ r: row, c: partNoColumnIndex })];
        const quantityCell = worksheet[xlsx.utils.encode_cell({ r: row, c: headers['Qty'] })];

        if (partNoCell) {
            const partNo = cleanPartNumber(partNoCell.v ? partNoCell.v.toString() : ''); // Clean part number
            const valueCell = worksheet[xlsx.utils.encode_cell({ r: row, c: headers['Value'] })];
            const packageCell = worksheet[xlsx.utils.encode_cell({ r: row, c: headers['Package'] })];
            const qualificationCell = worksheet[xlsx.utils.encode_cell({ r: row, c: headers['Qualification'] })];
            const quantity = quantityCell ? quantityCell.v : 'undefined';  // Get quantity, default to 'undefined'

            const value = valueCell ? valueCell.v : 'undefined';
            const pkg = packageCell ? packageCell.v : 'undefined';
            const qualification = qualificationCell ? qualificationCell.v : 'undefined';

            // Log details to ensure proper data extraction
            console.log(`Row ${row} - Part No: ${partNo}, Qty: ${quantity}`);

            parts.push({ partNo, value, package: pkg, qualification, quantity, row });
        }
    }

    return parts; // Return the array of parts
}

// Function to clean part numbers for comparison (removes hyphens)
function cleanPartForComparison(partNo) {
    return partNo.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); // Remove non-alphanumeric characters and make it uppercase
}
// Function to store PDF data in the database
function storePDFDataInDB(partsData, callback) {
    const insertPDFDataQuery = `
        INSERT INTO pdf_data (part_no) 
        VALUES ($1) 
        ON CONFLICT (part_no) DO NOTHING
    `;

    let processedCount = 0; // Counter to track processed entries
    const totalParts = partsData.length; // Total parts to process

    if (totalParts === 0) {
        console.log('No parts to store in the database.');
        return callback({ success: true }); // Handle case with no parts
    }

    partsData.forEach((partData) => {
        const { partNo } = partData;

        console.log(`Storing Part No: ${partNo}`); // Debugging statement

        client.query(insertPDFDataQuery, [partNo], (err) => {
            processedCount++; // Increment the processed count

            if (err) {
                console.error('Error inserting PDF data into database:', err);
                return callback({ error: err.message });
            }

            // If all parts have been processed, call the callback
            if (processedCount === totalParts) {
                console.log('All parts processed successfully.');
                callback({ success: true });
            }
        });
    });
}

// Function to compare PDF parts with parts stored in the database
function compareParts(callback) {
    const fetchDBPartsQuery = 'SELECT part_no FROM bom_parts';
    const fetchPDFPartsQuery = 'SELECT part_no FROM pdf_data';

    client.query(fetchDBPartsQuery, (dbErr, dbResult) => {
        if (dbErr) {
            console.error('Error fetching BOM parts:', dbErr);
            return callback({ error: dbErr.message });
        }

        const dbParts = dbResult.rows.map(dbPart => cleanPartForComparison(dbPart.part_no));

        client.query(fetchPDFPartsQuery, (pdfErr, pdfResult) => {
            if (pdfErr) {
                console.error('Error fetching PDF parts:', pdfErr);
                return callback({ error: pdfErr.message });
            }

            const pdfParts = pdfResult.rows;
            const commonParts = [];

            pdfParts.forEach((pdfPart) => {
                const cleanedPDFPart = cleanPartForComparison(pdfPart.part_no);
                if (dbParts.includes(cleanedPDFPart)) {
                    commonParts.push({
                        partNo: pdfPart.part_no,
                    });
                }
            });

            callback(commonParts); // Return matched parts
        });
    });
}

// Main comparison function (should be called when needed)
async function handlePDFComparison(pdfFilePath) {
    try {
        const pdfText = await extractPDFText(pdfFilePath);
        const pdfParts = extractPartsFromPDFText(pdfText);
        const partsData = pdfParts.map(part => ({
            partNo: part,
            salesQty: '1' // Replace with actual logic for fetching sales qty from the PDF if applicable
        }));

        storePDFDataInDB(partsData, (result) => {
            if (result.error) {
                console.error('Error storing PDF data:', result.error);
            } else {
                console.log('PDF data stored successfully. Now comparing parts...');
                compareParts((commonParts) => {
                    console.log('Comparison result:', commonParts);
                });
            }
        });
    } catch (error) {
        console.error('Error during PDF comparison:', error);
    }
}

// Export functions for use in other modules
module.exports = { 
    handlePDFComparison, 
    extractPartNumbersFromExcel, 
    getAllPartDetailsFromExcel, 
    extractPDFText // Ensure this is included
};


