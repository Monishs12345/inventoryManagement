const express = require('express');
const path = require('path');
const cors = require('cors');
const { extractPDFText, handlePDFComparison, extractPartNumbersFromExcel, getAllPartDetailsFromExcel } = require('./readBom');
const pool = require('./db');
const multer = require('multer');
const fs = require('fs');
const upload = multer({ dest: 'uploads/' });
const fileUpload = require('express-fileupload');
const pdf = require('pdf-parse');
const XLSX = require('xlsx');
const app = express();
const port = 3016;

app.use(fileUpload());
app.use(express.json());
app.use(cors());

const extractPartNumberFromExcel = (excelPath) => {
    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    const partsWithQty = [];
    let lastPartNo = null;

    for (let i = 0; i < data.length; i++) {
        const row = data[i];

        if (row.length > 0) {
            const firstCell = row[0];

            if (typeof firstCell === 'string' && /^[A-Za-z0-9\-]+:/.test(firstCell)) {
                let partNo = firstCell.split(':')[0].trim();
                partNo = partNo.replace(/[-\/_\.]/g, '');
                lastPartNo = partNo;
                console.log(`Detected Part No: ${partNo} on row ${i}`);
            } else if (lastPartNo) {
                for (let j = i; j < i + 5 && j < data.length; j++) {
                    const nextRow = data[j];
                    for (const cell of nextRow) {
                        if (typeof cell === 'number' && !isNaN(cell)) {
                            partsWithQty.push({ partNo: lastPartNo, salesQty: cell });
                            console.log(`Matched Quantity: ${cell} for Part No: ${lastPartNo} on row ${j}`);
                            lastPartNo = null;
                            break;
                        }
                    }
                    if (lastPartNo === null) break;
                }
            }
        } else {
            console.log(`Skipped row ${i} due to insufficient data.`);
        }
    }

    console.log("Final extracted parts with quantities:", partsWithQty);
    return partsWithQty;
};

const crypto = require('crypto');

app.post('/uploadBOMs', async (req, res) => {
    if (!req.files || !req.files.bomFiles) {
        return res.status(400).json({ message: 'BOM files are required.' });
    }

    const bomFiles = Array.isArray(req.files.bomFiles) ? req.files.bomFiles : [req.files.bomFiles];

    try {
        const uploadResults = await Promise.all(bomFiles.map(async (bomFile) => {
            const bomPath = path.join(__dirname, 'uploads', bomFile.name);

            const fileBuffer = bomFile.data;
            const hashSum = crypto.createHash('sha256');
            hashSum.update(fileBuffer);
            const fileHash = hashSum.digest('hex');

            const checkQuery = 'SELECT 1 FROM uploaded_boms WHERE file_hash = $1';
            const result = await pool.query(checkQuery, [fileHash]);

            if (result.rowCount > 0) {
                console.log(`Duplicate BOM file ${bomFile.name} detected, skipping upload.`);
                return 'Duplicate BOM detected. Cannot upload the same BOM again.';
            }

            await bomFile.mv(bomPath);

            const partDetails = getAllPartDetailsFromExcel(bomPath);

            const insertHashQuery = 'INSERT INTO uploaded_boms (file_name, file_hash) VALUES ($1, $2)';
            await pool.query(insertHashQuery, [bomFile.name, fileHash]);

            await Promise.all(partDetails.map(async (part) => {
                let { partNo, value, package, qualification, quantity } = part;
            
                if (typeof quantity !== 'number' || isNaN(quantity) || !partNo.match(/^[A-Za-z0-9]+$/)) {
                    console.warn(`Skipping invalid entry - Part No: ${partNo}, Qty: ${quantity}`);
                    return;
                }
            
                const insertQuery = `
                    INSERT INTO bom_parts (part_no, value, package, qualification, quantity)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (part_no) DO NOTHING;
                `;
                try {
                    await pool.query(insertQuery, [partNo, value, package, qualification, quantity]);
                    console.log(`Inserted part ${partNo} in the database.`);
                } catch (err) {
                    console.error(`Error inserting part ${partNo}:`, err);
                    throw err;
                }
            }));
            
            return 'BOM uploaded successfully!';
        }));

        const duplicateMessages = uploadResults.filter(result => result === 'Duplicate BOM detected. Cannot upload the same BOM again.');

        if (duplicateMessages.length > 0) {
            res.status(409).json({ message: duplicateMessages[0] });
        } else {
            res.status(200).json({ message: 'BOM files uploaded successfully!' });
        }
    } catch (error) {
        console.error('Error uploading BOM files:', error);
        res.status(500).json({ message: 'Error uploading BOM files.' });
    }
});

app.post('/manualEntry', async (req, res) => {
    const { poNumber, parts } = req.body;

    try {
        const existingPONumberResult = await pool.query(`
            SELECT COUNT(*) FROM pdf_data WHERE po_no = $1;
        `, [poNumber]);

        if (existingPONumberResult.rows[0].count > 0) {
            console.log('PO number already exists. No changes made.');
            return res.status(200).json({ message: 'PO number already exists. No changes made.' });
        }

        const bomPartsResult = await pool.query(`SELECT part_no FROM bom_parts`);
        const bomPartNumbers = new Set(bomPartsResult.rows.map(row => row.part_no));

        const commonPartsWithQty = parts.filter(({ partNo }) => bomPartNumbers.has(partNo));

        if (commonPartsWithQty.length === 0) {
            console.log('No common parts found.');
            return res.status(200).json({ message: 'No common parts found.' });
        }

        console.log("Common parts with quantities:", commonPartsWithQty);

        const insertPromises = commonPartsWithQty.map(({ partNo, salesQty }) => {
            return pool.query(`
                INSERT INTO pdf_data (part_no, sales_qty, po_no)
                VALUES ($1, $2, $3)
                ON CONFLICT (part_no) DO UPDATE SET sales_qty = pdf_data.sales_qty + EXCLUDED.sales_qty;
            `, [partNo, salesQty, poNumber]);
        });

        await Promise.all(insertPromises);

        res.status(200).json(commonPartsWithQty.map(part => ({
            part_no: part.partNo,
            sales_qty: part.salesQty
        })));
    } catch (error) {
        console.error('Error processing manual entry:', error);
        res.status(500).json({ message: 'Error processing manual entry.' });
    }
});
app.post('/updateQuantity', async (req, res) => {
    const { partNo, newQty } = req.body;

    try {
        await pool.query(`
            UPDATE pdf_data
            SET sales_qty = $1
            WHERE part_no = $2
        `, [newQty, partNo]);

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating quantity:', error);
        res.status(500).json({ success: false, message: 'Error updating quantity' });
    }
});

app.post('/updateShelf', async (req, res) => {
    const { partNo, shelf } = req.body;

    try {
        await pool.query(`
            UPDATE pdf_data
            SET shelf = $1
            WHERE part_no = $2
        `, [shelf, partNo]);

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating shelf:', error);
        res.status(500).json({ success: false, message: 'Error updating shelf' });
    }
});

app.get('/searchPart', async (req, res) => {
    const { partNo } = req.query;

    try {
        const pdfResult = await pool.query(`
            SELECT shelf, sales_qty
            FROM pdf_data
            WHERE part_no = $1
        `, [partNo]);

        const bomResult = await pool.query(`
            SELECT value, qualification, package
            FROM bom_parts
            WHERE part_no = $1
        `, [partNo]);

        if (pdfResult.rows.length > 0 || bomResult.rows.length > 0) {
            res.json({
                found: true,
                pdf: pdfResult.rows[0] || null,
                bom: bomResult.rows[0] || null
            });
        } else {
            res.json({ found: false });
        }
    } catch (error) {
        console.error('Error searching for part:', error);
        res.status(500).json({ message: 'Error searching for part' });
    }
});

app.get('/autocomplete', async (req, res) => {
    const { partNo } = req.query;

    try {
        const result = await pool.query(`
            SELECT DISTINCT 
                COALESCE(p.part_no, b.part_no) as part_no, 
                p.sales_qty, 
                b.quantity as bom_qty,
                b.value,
                b.qualification,
                b.package
            FROM pdf_data p
            FULL OUTER JOIN bom_parts b ON p.part_no = b.part_no
            WHERE p.part_no ILIKE $1 OR b.part_no ILIKE $1
            LIMIT 10
        `, [`%${partNo}%`]);

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching autocomplete suggestions:', error);
        res.status(500).json({ message: 'Error fetching autocomplete suggestions' });
    }
});

// Add this new endpoint for searching by shelf
app.get('/searchByShelf', async (req, res) => {
    const { shelf } = req.query;

    try {
        const result = await pool.query(`
            SELECT part_no, sales_qty
            FROM pdf_data
            WHERE shelf ILIKE $1
        `, [`%${shelf}%`]);

        res.json(result.rows);
    } catch (error) {
        console.error('Error searching by shelf:', error);
        res.status(500).json({ message: 'Error searching by shelf' });
    }
});

// Existing endpoints remain unchanged

app.listen(port, () => {
    console.log(`Server listening at http://127.0.0.1:${port}`);
});