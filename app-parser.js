// app-parser.js
// Dedicated Parsing Engine for the Eclipse Web App Portal
// Extracts Pilot Name, License No, and Validates Qualifications

function parseAndBuildDashboard(html, THRESHOLD) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(html, "text/html");

    // --- DOM Security Sweep ---
    // Remove scripts, styles, SVG path files, and other minified junk from memory
    var tagsToRemove = ['script', 'style', 'svg', 'iframe', 'noscript', 'canvas'];
    tagsToRemove.forEach(function(tag) {
        var elList = doc.querySelectorAll(tag);
        for (var i = 0; i < elList.length; i++) {
            elList[i].remove();
        }
    });

    // Helper: Page 2 Isolation
    function isUnderPg2(el) {
        if (!el) return false;
        if (typeof el.closest === 'function') return el.closest('#pg2') !== null;
        var curr = el;
        while (curr) {
            if (curr.id === 'pg2') return true;
            curr = curr.parentElement;
        }
        return false;
    }

    // Helper: Fetch direct children of row (prevents nested layout bleeds)
    function getDirectChildCells(tr) {
        var cells = [];
        if (tr && tr.children) {
            for (var i = 0; i < tr.children.length; i++) {
                var child = tr.children[i];
                var tagName = child.tagName.toUpperCase();
                if (tagName === 'TD' || tagName === 'TH') cells.push(child);
            }
        }
        if (cells.length === 0 && tr) {
            var qcells = tr.querySelectorAll('td, th');
            for (var j = 0; j < qcells.length; j++) cells.push(qcells[j]);
        }
        return cells;
    }

    // Helper: Translate Date Formats
    function parseLicenseDate(dateStr) {
        if (!dateStr) return null;
        var trimmed = dateStr.trim();
        if (trimmed.toUpperCase() === 'NO EXPIRY' || trimmed.toUpperCase() === 'NIL' || trimmed.toUpperCase() === 'NA') return null;
        
        var match = trimmed.match(/^(\d{1,2})\s+([a-zA-Z]{3,10})\s+(\d{4})$/);
        if (!match) return null;
        
        var day = parseInt(match[4], 10);
        var monthStr = match[5].toUpperCase(); 
        var year = parseInt(match[6], 10);     
        
        var months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
        var monthsMalay = ["JAN", "FEB", "MAC", "APR", "MEI", "JUN", "JUL", "OGOS", "SEP", "OKT", "NOV", "DIS"];
        
        var monthIdx = months.indexOf(monthStr);
        if (monthIdx === -1) monthIdx = monthsMalay.indexOf(monthStr);
        if (monthIdx === -1) return null;
        
        return new Date(year, monthIdx, day);
    }

    // Helper: Check visual Red status
    function isRedOrExpired(el) {
        if (!el) return false;
        var text = el.textContent.trim().toUpperCase();
        if (text === 'EXPIRED') return true;
        
        var inlineStyle = (el.getAttribute('style') || '').toLowerCase();
        if (inlineStyle.includes('color: red') || inlineStyle.includes('color:red') || 
            inlineStyle.includes('color: #ff0000') || inlineStyle.includes('background: #ff0000') || 
            inlineStyle.includes('background: red')) {
            return true;
        }
        return false;
    }

    // Helper: Ignore non-qualification timestamps
    function shouldIgnore(el) {
        if (!el || isUnderPg2(el)) return true;
        var text = el.textContent.trim();
        if (!text) return true;
        var upperText = text.toUpperCase();
        
        if (upperText.indexOf("INITIAL GRANT") !== -1 || /^\d{1,2}:\d{2}:\d{2}$/.test(text)) return true;
        if (upperText.indexOf("7 DECEMBER 1944") !== -1 || upperText.indexOf("DECEMBER 1944") !== -1) return true;
        
        var curr = el;
        for (var i = 0; i < 5; i++) {
            if (!curr) break;
            var tagName = curr.tagName.toUpperCase();
            if (tagName === 'TABLE' || tagName === 'TBODY' || tagName === 'THEAD' || tagName === 'BODY' || tagName === 'HTML' || tagName === 'TR' || tagName === 'TFOOT') break;
            
            if (tagName === 'DIV') {
                var className = (curr.className || '').toLowerCase();
                if (className.indexOf('row') !== -1 || className.indexOf('container') !== -1 || className.indexOf('col-') !== -1 || className.indexOf('card') !== -1) break;
            }
            
            var currText = curr.textContent.toUpperCase();
            if (currText.indexOf("DATE OF BIRTH") !== -1 || currText.indexOf("TARIKH LAHIR") !== -1 ||
                currText.indexOf("SIGNATURE OF ISSUING OFFICER") !== -1 || currText.indexOf("LAST SYNCHRONIZATION") !== -1) return true;
            
            curr = curr.parentElement;
        }

        // Table-based filters (Ignores Validity Issue Dates on Pass 3 Fallbacks)
        var tr = el.closest('tr');
        if (tr) {
            var rowText = tr.textContent.toUpperCase();
            if (rowText.indexOf("VALIDITY ISSUE DATE") !== -1 || rowText.indexOf("TARIKH KELUARAN") !== -1) {
                return true; // Ignore header row itself
            }
            
            var tds = getDirectChildCells(tr);
            var dateIndices = [];
            for (var j = 0; j < tds.length; j++) {
                var cellText = tds[j].textContent.trim();
                var isDatePattern = /^\d{1,2}\s+[a-zA-Z]{3,10}\s+\d{4}$/.test(cellText) || cellText.toUpperCase() === 'NO EXPIRY';
                if (isDatePattern) {
                    dateIndices.push(j);
                }
            }
            
            // If a row has more than one date, ignore all but the very last date column (the Expiry column)
            if (dateIndices.length > 1) {
                var cellIndex = -1;
                for (var j = 0; j < tds.length; j++) {
                    if (tds[j] === el || tds[j].contains(el)) {
                        cellIndex = j;
                        break;
                    }
                }
                if (cellIndex !== -1 && dateIndices.indexOf(cellIndex) !== -1 && cellIndex !== dateIndices[dateIndices.length - 1]) {
                    return true;
                }
            }
        }
        
        return false;
    }

    // --- Extractor Core ---
    var pilotName = "Unknown Pilot";
    var pilotLicense = "License No: -";

    // 2. Fetch body text completely cleaned of scripts, styles, and tags
    var rawBodyText = doc.body.textContent || "";
    var bodyText = rawBodyText.replace(/\s+/g, " ");

    // 3. Resilient Name Extraction (100% accurate, ignores markup/table structures)
    var nameMatch = bodyText.match(/Full Name of Holder\s*(?:\([^)]*\)\s*)*[^A-Za-z]*\s*([A-Za-z\s\.\'\-]+?)\s*[^A-Za-z]*\s*(?:\s+(?:IVc|Date of Birth|Tarikh Lahir|Address|Alamat|Nationality|MALAYSIAN)|$)/i);
    if (nameMatch && nameMatch[4]) {
        pilotName = nameMatch[4].trim();
        // Trim standard trailing noise
        pilotName = pilotName.replace(/^[|\|\s\-\.\'\#\:\*]+/, '').replace(/[|\|\s\-\.\'\#\:\*]+$/, '').trim();
    }

    // 4. Resilient License Number Extraction (Dual-Pass Lookahead Matching)
    // Pass A: Query Section III directly
    var section3Match = bodyText.match(/III\s*\|?\s*LICENCE\s*NO\.?\s*([^(\||\\(]+?)(?:\s*\(|\s*\||\s*$)/i);
    if (section3Match && section3Match[4]) {
        var val = section3Match[4].trim();
        val = val.replace(/^[|\|\s\-\.\'\#\:\*]+/, '').replace(/[|\|\s\-\.\'\#\:\*]+$/, '').trim();
        if (val && val.length > 2 && val.toUpperCase() !== "NOMBOR" && val.toUpperCase() !== "NEW" && val.toUpperCase() !== "BARU") {
            pilotLicense = "Licence No: " + val;
        }
    }

    // Pass B: Lookahead search against top banner (Fallback)
    if (pilotLicense === "License No: -") {
        var licMatch = bodyText.match(/Licence\s*No[^\w]*Nombor\s*Lesen\s*(?:Baru|Lama)?\s*[^\w]*([A-Z0-9\/\s\-]+?)(?=\s+Old|\s+Nombor|\s+Licence|\s*[*]+|$)/i);
        if (licMatch && licMatch[4]) {
            var val = licMatch[4].trim();
            val = val.replace(/^[|\|\s\-\.\'\#\:\*]+/, '').replace(/[|\|\s\-\.\'\#\:\*]+$/, '').trim();
            if (val && val.length > 2 && val.toUpperCase() !== "NOMBOR" && val.toUpperCase() !== "NEW" && val.toUpperCase() !== "BARU") {
                pilotLicense = "Licence No: " + val;
            }
        }
    }

    // Extract Qualifications
    var qualificationData = {};
    var refDate = new Date();

    // Pass 1: Card Components
    var cards = doc.querySelectorAll('.card');
    cards.forEach(card => {
        if (isUnderPg2(card)) return;
        var cardText = card.textContent.toUpperCase();
        
        if (cardText.indexOf('MEDICAL EXPIRY DATE') !== -1 || cardText.indexOf('LICENCE TYPE') !== -1) return;
        var cardNormalized = cardText.replace(/\s+/g, '');
        if (cardNormalized.indexOf('CLASS1(SC)') !== -1) return;

        var titleEl = card.querySelector('.col-sm-12 .bg-gray-300') || card.querySelector('div[style*="font-weight: 500"]') || card.querySelector('.fs-5');
        var labelText = titleEl ? titleEl.textContent.trim() : "";
        var dateEl = card.querySelector('.text-uppercase b') || card.querySelector('.fs-4 b, .fs-3 b');
        var dateText = dateEl ? dateEl.textContent.trim() : "";

        if (labelText && dateText && !shouldIgnore(dateEl)) {
            var key = labelText.toUpperCase().replace(/\s+/g, '');
            var parsedDate = parseLicenseDate(dateText);
            var isExpired = isRedOrExpired(dateEl) || cardText.indexOf('EXPIRED') !== -1;
            registerQualification(key, labelText, dateText, parsedDate, isExpired);
        }
    });

    // Pass 2: Tables
    var rows = doc.querySelectorAll('tr');
    rows.forEach(tr => {
        if (isUnderPg2(tr)) return;
        var rowText = tr.textContent.toUpperCase();
        if (rowText.indexOf('LICENCE TYPE') !== -1 || rowText.indexOf('MEDICAL CLASS') !== -1 || rowText.indexOf('MEDICAL EXPIRY DATE') !== -1) return;
        if (rowText.indexOf("VALIDITY ISSUE DATE") !== -1 || rowText.indexOf("TARIKH KELUARAN") !== -1) return; // Skip headers
        
        var rowNormalized = rowText.replace(/\s+/g, '');
        if (rowNormalized.indexOf('CLASS1(SC)') !== -1) return;

        var tds = getDirectChildCells(tr);
        
        // Find which cells in this row contain date formats
        var dateIndices = [];
        for (var i = 0; i < tds.length; i++) {
            var text = tds[i].textContent.trim();
            var isDatePattern = /^\d{1,2}\s+[a-zA-Z]{3,10}\s+\d{4}$/.test(text) || text.toUpperCase() === 'NO EXPIRY';
            if (isDatePattern) {
                dateIndices.push(i);
            }
        }

        // Identify multi-date rows (Issue Date and Expiry Date together)
        var isMultiDateRow = dateIndices.length > 1;

        // Label extraction: first non-date non-empty cell
        var labelText = "";
        for (var i = 0; i < tds.length; i++) {
            var text = tds[i].textContent.replace('•', '').trim();
            if (!text) continue;
            var isDatePattern = /^\d{1,2}\s+[a-zA-Z]{3,10}\s+\d{4}$/.test(text) || text.toUpperCase() === 'NO EXPIRY';
            if (!isDatePattern) {
                labelText = text;
                break;
            }
        }

        if (!labelText) return;

        tds.forEach((td, idx) => {
            var text = td.textContent.trim();
            var isDatePattern = /^\d{1,2}\s+[a-zA-Z]{3,10}\s+\d{4}$/.test(text) || text.toUpperCase() === 'NO EXPIRY';
            if (isDatePattern) {
                // If it is a multi-date row, only process the last column (the Expiry column) and skip previous ones!
                if (isMultiDateRow && idx !== dateIndices[dateIndices.length - 1]) {
                    return;
                }

                if (!shouldIgnore(td)) {
                    var key = labelText.toUpperCase().replace(/\s+/g, '');
                    var parsedDate = parseLicenseDate(text);
                    var isExpired = isRedOrExpired(td) || isRedOrExpired(tr) || rowText.indexOf('EXPIRED') !== -1;
                    registerQualification(key, labelText, text, parsedDate, isExpired);
                }
            }
        });
    });

    function registerQualification(key, name, dateText, parsedDate, isExpired) {
        name = name.replace('•', '').trim();
        var status = "VALID";
        var daysRemaining = null;

        if (isExpired) {
            status = "EXPIRED";
        } else if (parsedDate) {
            var diff = parsedDate.getTime() - refDate.getTime();
            daysRemaining = Math.ceil(diff / (1000 * 60 * 60 * 24));
            if (diff < 0) status = "EXPIRED";
            else if (daysRemaining <= THRESHOLD) status = "EXPIRING_SOON";
        }

        if (qualificationData[key] && qualificationData[key].status === "EXPIRED") return;

        qualificationData[key] = { name, dateText, daysRemaining, status };
    }

    // --- Render UI Elements ---
    document.getElementById('dash-name').innerText = pilotName;
    document.getElementById('dash-license').innerText = pilotLicense;

    var listContainer = document.getElementById('dash-list');
    listContainer.innerHTML = ''; // Clear container
    var hasExpired = false;
    var hasWarning = false;

    for (var k in qualificationData) {
        var q = qualificationData[k];
        var row = document.createElement('div');
        row.className = 'item-row';

        var nameSpan = document.createElement('span');
        nameSpan.className = 'item-name';
        nameSpan.innerText = q.name;

        var dateBox = document.createElement('div');
        dateBox.className = 'item-date';

        var dateTextSpan = document.createElement('div');
        dateTextSpan.style.fontWeight = "bold";
        dateTextSpan.innerText = q.dateText;

        var subSpan = document.createElement('div');
        subSpan.className = 'item-sub';

        if (q.status === "EXPIRED") {
            hasExpired = true;
            subSpan.innerText = "EXPIRED";
            subSpan.style.color = "var(--status-red)";
        } else if (q.status === "EXPIRING_SOON") {
            hasWarning = true;
            subSpan.innerText = q.daysRemaining + " days remaining";
            subSpan.style.color = "var(--status-orange)";
        } else {
            subSpan.innerText = "VALID";
            subSpan.style.color = "var(--status-green)";
        }

        dateBox.appendChild(dateTextSpan);
        dateBox.appendChild(subSpan);
        row.appendChild(nameSpan);
        row.appendChild(dateBox);
        listContainer.appendChild(row);
    }

    var banner = document.getElementById('dash-banner');
    if (hasExpired) {
        banner.innerText = "🔴 DO NOT FLY!";
        banner.style.backgroundColor = "var(--status-red)";
    } else if (hasWarning) {
        banner.innerText = "⚠️ FLY WITH CAUTION!";
        banner.style.backgroundColor = "var(--status-orange)";
    } else {
        banner.innerText = "🟢 HAVE A SAFE FLIGHT!";
        banner.style.backgroundColor = "var(--status-green)";
    }

    showView('view-dashboard');
}
