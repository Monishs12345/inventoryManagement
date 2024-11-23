const url = "http://127.0.0.1:3016";

function showMessage(message) {
    const messageBox = document.getElementById('messageBox');
    if (!messageBox) {
        const newMessageBox = document.createElement('div');
        newMessageBox.id = 'messageBox';
        newMessageBox.style.border = '1px solid #ccc';
        newMessageBox.style.padding = '10px';
        newMessageBox.style.marginTop = '10px';
        newMessageBox.style.backgroundColor = '#f9f9f9';
        document.body.prepend(newMessageBox);
    }
    document.getElementById('messageBox').innerText = message;
}

document.getElementById('uploadBOMs').addEventListener('submit', function (e) {
    e.preventDefault();

    const formData = new FormData();
    const bomFiles = document.getElementById('bomFiles').files;
    for (let i = 0; i < bomFiles.length; i++) {
        formData.append('bomFiles', bomFiles[i]);
    }

    showMessage("Uploading BOM files to the database...");

    fetch(`${url}/uploadBOMs`, {
        method: 'POST',
        body: formData
    })
    .then(response => response.json().then(data => ({ status: response.status, body: data })))
    .then(({ status, body }) => {
        console.log('Response Status:', status);
        if (status === 409) {
            showMessage(body.message);
            alert(body.message);
        } else if (status !== 200) {
            throw new Error(body.message || 'Failed to upload BOMs');
        } else {
            showMessage(body.message || "BOM files uploaded successfully!");
            alert('BOM files uploaded successfully!');
        }
    })
    .catch(error => {
        showMessage(error.message);
        console.error('Error:', error);
        alert('Error: ' + error.message);
    });
});

document.getElementById('manualEntry').addEventListener('submit', function (e) {
    e.preventDefault();

    const formData = new FormData(this);
    const manualData = {
        poNumber: formData.get('poNumber'),
        parts: []
    };

    const partNos = formData.getAll('partNo[]');
    const salesQtys = formData.getAll('salesQty[]');

    for (let i = 0; i < partNos.length; i++) {
        manualData.parts.push({
            partNo: partNos[i],
            salesQty: parseInt(salesQtys[i], 10)
        });
    }

    showMessage("Submitting manual entry data for comparison...");

    fetch(`${url}/manualEntry`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(manualData)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to submit manual entry data');
        }
        return response.json();
    })
    .then(data => {
        showMessage("Comparing part numbers between manual entry and BOM...");

        const commonPartsBody = document.getElementById('commonPartsBody');
        commonPartsBody.innerHTML = '';

        if (Array.isArray(data) && data.length > 0) {
            console.log('Received Data:', data);

            data.forEach(part => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${part.part_no || 'No Part No'}</td>
                    <td>
                        <input type="number" value="${part.sales_qty || 0}" min="0" data-part-no="${part.part_no}" class="qty-input">
                        <input type="number" placeholder="Change Qty" class="change-qty">
                        <button class="add-qty" data-part-no="${part.part_no}">Add</button>
                        <button class="remove-qty" data-part-no="${part.part_no}">Remove</button>
                        <button class="update-qty" data-part-no="${part.part_no}">Update</button>
                    </td>
                    <td>
                        <input type="text" value="${part.shelf || ''}" placeholder="Enter Shelf" class="shelf-input" data-part-no="${part.part_no}">
                        <button class="update-shelf" data-part-no="${part.part_no}">Update Shelf</button>
                    </td>
                `;
                commonPartsBody.appendChild(row);
            });

            // Add event listeners for quantity buttons
            document.querySelectorAll('.add-qty').forEach(button => {
                button.addEventListener('click', function() {
                    const row = this.closest('tr');
                    const qtyInput = row.querySelector('.qty-input');
                    const changeQtyInput = row.querySelector('.change-qty');
                    const changeQty = parseInt(changeQtyInput.value) || 0;
                    qtyInput.value = parseInt(qtyInput.value) + changeQty;
                    changeQtyInput.value = '';
                });
            });

            document.querySelectorAll('.remove-qty').forEach(button => {
                button.addEventListener('click', function() {
                    const row = this.closest('tr');
                    const qtyInput = row.querySelector('.qty-input');
                    const changeQtyInput = row.querySelector('.change-qty');
                    const changeQty = parseInt(changeQtyInput.value) || 0;
                    qtyInput.value = Math.max(0, parseInt(qtyInput.value) - changeQty);
                    changeQtyInput.value = '';
                });
            });

            document.querySelectorAll('.update-qty').forEach(button => {
                button.addEventListener('click', function() {
                    const partNo = this.getAttribute('data-part-no');
                    const newQty = this.closest('tr').querySelector('.qty-input').value;
                    updateQuantity(partNo, newQty);
                });
            });

            document.querySelectorAll('.update-shelf').forEach(button => {
                button.addEventListener('click', function() {
                    const partNo = this.getAttribute('data-part-no');
                    const shelf = this.closest('tr').querySelector('.shelf-input').value;
                    updateShelf(partNo, shelf);
                });
            });

            showMessage("Comparison completed. Common parts displayed.");
            document.getElementById('downloadCSV').style.display = 'block';
        } else if (typeof data === 'object' && data.message) {
            showMessage(data.message);
            commonPartsBody.innerHTML = `<tr><td colspan="3">${data.message}</td></tr>`;
        } else {
            showMessage("No common parts found between manual entry and BOM.");
            commonPartsBody.innerHTML = '<tr><td colspan="3">No common parts found.</td></tr>';
        }
    })
    .catch(error => {
        showMessage('Error comparing parts.');
        console.error('Error submitting manual entry data:', error);
        alert('Error: ' + error.message);
    });
});

function updateQuantity(partNo, newQty) {
    fetch(`${url}/updateQuantity`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ partNo, newQty })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showMessage(`Updated quantity for part ${partNo}`);
        } else {
            showMessage(`Failed to update quantity for part ${partNo}`);
        }
    })
    .catch(error => {
        console.error('Error updating quantity:', error);
        showMessage(`Error updating quantity for part ${partNo}`);
    });
}

function updateShelf(partNo, shelf) {
    fetch(`${url}/updateShelf`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ partNo, shelf })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showMessage(`Updated shelf for part ${partNo} to ${shelf}`);
        } else {
            showMessage(`Failed to update shelf for part ${partNo}`);
        }
    })
    .catch(error => {
        console.error('Error updating shelf:', error);
        showMessage(`Error updating shelf for part ${partNo}`);
    });
}

function searchPart() {
    const partNo = document.getElementById('searchPartNo').value;
    fetch(`${url}/searchPart?partNo=${encodeURIComponent(partNo)}`)
    .then(response => response.json())
    .then(data => {
        const searchResult = document.getElementById('searchResult');
        if (data.found) {
            let resultHTML = `<h3>Search Results for Part ${partNo}:</h3>`;
            if (data.pdf) {
                resultHTML += `
                    <h4>PDF Data:</h4>
                    <p>Shelf: ${data.pdf.shelf || 'N/A'}</p>
                    <p>Sales Quantity: ${data.pdf.sales_qty || 'N/A'}</p>
                `;
            }
            if (data.bom) {
                resultHTML += `
                    <h4>BOM Data:</h4>
                    <p>Value: ${data.bom.value || 'N/A'}</p>
                    <p>Qualification: ${data.bom.qualification || 'N/A'}</p>
                    <p>Package: ${data.bom.package || 'N/A'}</p>
                `;
            }
            searchResult.innerHTML = resultHTML;
        } else {
            searchResult.innerHTML = `<p>Part ${partNo} not found in either PDF or BOM data.</p>`;
        }
    })
    .catch(error => {
        console.error('Error searching for part:', error);
        showMessage(`Error searching for part ${partNo}`);
    });
}

function searchByShelf() {
    const shelf = document.getElementById('searchShelf').value;
    fetch(`${url}/searchByShelf?shelf=${encodeURIComponent(shelf)}`)
    .then(response => response.json())
    .then(data => {
        const searchResult = document.getElementById('searchResult');
        if (data.length > 0) {
            let resultHTML = `<h3>Parts found on shelf ${shelf}:</h3><ul>`;
            data.forEach(part => {
                resultHTML += `<li>Part Number: ${part.part_no}, Quantity: ${part.sales_qty}</li>`;
            });
            resultHTML += '</ul>';
            searchResult.innerHTML = resultHTML;
        } else {
            searchResult.innerHTML = `<p>No parts found on shelf ${shelf}.</p>`;
        }
    })
    .catch(error => {
        console.error('Error searching by shelf:', error);
        showMessage(`Error searching for shelf ${shelf}`);
    });
}

function autocomplete() {
    const input = document.getElementById('searchPartNo');
    const autocompleteList = document.getElementById('autocompleteList');
    
    input.addEventListener('input', function() {
        const inputValue = this.value;
        if (inputValue.length < 2) {
            autocompleteList.style.display = 'none';
            return;
        }

        fetch(`${url}/autocomplete?partNo=${encodeURIComponent(inputValue)}`)
            .then(response => response.json())
            .then(data => {
                autocompleteList.innerHTML = '';
                data.forEach(item => {
                    const li = document.createElement('li');
                    li.textContent = `${item.part_no} (PDF Qty: ${item.sales_qty || 'N/A'})`;
                    li.title = `Value: ${item.value || 'N/A'}, Qualification: ${item.qualification || 'N/A'}, Package: ${item.package || 'N/A'}`;
                    li.addEventListener('click', function() {
                        input.value = item.part_no;
                        autocompleteList.style.display = 'none';
                    });
                    autocompleteList.appendChild(li);
                });
                autocompleteList.style.display = data.length ? 'block' : 'none';
            })
            .catch(error => {
                console.error('Error fetching autocomplete suggestions:', error);
            });
    });

    document.addEventListener('click', function(e) {
        if (e.target !== input && e.target !== autocompleteList) {
            autocompleteList.style.display = 'none';
        }
    });
}

document.getElementById('downloadCSV').addEventListener('click', function () {
    showMessage("Preparing CSV download...");

    const rows = Array.from(document.querySelectorAll('.common-table tr'));
    const csvContent = rows.map(row => {
        const cells = Array.from(row.children);
        return cells.map(cell => {
            const input = cell.querySelector('input[type="number"], input[type="text"]');
            return input ? input.value : cell.textContent;
        }).join(',');
    }).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', 'comparison_results.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showMessage("CSV download completed.");
});

function showTab(tabName) {
    const tabs = document.querySelectorAll('.tab-content');
    const buttons = document.querySelectorAll('.tab-button');

    tabs.forEach(tab => {
        tab.style.display = 'none';
    });

    buttons.forEach(button => {
        button.classList.remove('active');
    });

    document.getElementById(tabName).style.display = 'block';
    document.querySelector(`.tab-button[onclick="showTab('${tabName}')"]`).classList.add('active');

    showMessage(`Switched to the ${tabName} tab.`);
}

function addPartEntry() {
    const partEntries = document.getElementById('partEntries');
    const newEntry = document.createElement('div');
    newEntry.className = 'part-entry';
    newEntry.innerHTML = `
        <input type="text" name="partNo[]" placeholder="Part Number" required>
        <input type="number" name="salesQty[]" placeholder="Sales Quantity" required>
    `;
    partEntries.appendChild(newEntry);
}

showTab('uploadBOMs');
autocomplete();