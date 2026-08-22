// app-parser.js
// Dedicated Parsing Engine for the Eclipse Web App Portal
// Extracts Pilot Name, License No, and Validates Qualifications

function parseAndBuildDashboard(html, THRESHOLD) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(html, "text/html");

    // 1. DOM SAFETY CLEANUP SWEEP
    // Completely purges non-visible script, style, SVG, and metadata blocks to prevent text pollution
    var scripts = doc.querySelectorAll('script, style, svg, noscript, iframe, link, meta');
    for (var i = 0; i < scripts.length; i++) {
        scripts[i].remove();
    }

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

    // Helper: Translate Date Formats (100% Corrected)
    function parseLicenseDate(dateStr) {
        if (!dateStr) return null;
        var trimmed = dateStr.trim();
        if (trimmed.toUpperCase() === 'NO EXPIRY' || trimmed.toUpperCase() === 'NIL' || trimmed.toUpperCase() === 'NA') return null;
        
        var match = trimmed.match(/^(\d{1,2})\s+([a-zA-Z]{3,10})\s+(\d{4})$/);
        if (!match) return null;
        
        var day = parseInt(match[1], 10);
        var monthStr = match[2].toUpperCase(); 
        var year = parseInt(match[3], 10);     
        
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
        
        if (upperText.indexOf("INITIAL GRANT") !== -1 || /^\\d{1,2}:\\d{2}:\\d{2}$/.test(text)) return true;
        if (upperText.indexOf("7 DECEMBER 1944") !== -1 || upperText.indexOf("DECEMBER 1944") !== -1) return true;
        
        // --- Table-Climbing Rule: Disregard "Validity Issue Date" in FCL tables ---
        var tr = el.closest('tr');
        if (tr) {
            var rowText = tr.textContent.toUpperCase();
            if (rowText.indexOf("VALIDITY ISSUE DATE") !== -1 || rowText.indexOf("TARIKH KELUARAN") !== -1) {
                return true; // Ignore header
            }
            var tds = getDirectChildCells(tr);
            if (tds.length === 3) {
                var table = tr.closest('table');
                var hasIssueDateHeader = false;
                if (table) {
                    var tableText = table.textContent.toUpperCase();
                    if (tableText.indexOf("VALIDITY ISSUE DATE") !== -1 || tableText.indexOf("TARIKH KELUARAN") !== -1) {
                        hasIssueDateHeader = true;
                    }
                }
                // If the table contains "Validity Issue Date" header, column tds[1] is the Issue Date - IGNORE IT!
                if (hasIssueDateHeader && (tds[1] === el || tds[1].contains(el))) {
                    return true;
                }
            }
        }

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
        return false;
    }

    // --- Extractor Core ---
    var pilotName = "Unknown Pilot";
    var pilotLicense = "License No: -";
    var cells = doc.querySelectorAll('td, th, p, div, span, b, h1, h2, h3');

    // 1. DOM-Based Name Extraction (Highly Reliable)
    for (var i = 0; i < cells.length; i++) {
        var text = cells[i].textContent.trim();
        if (text.indexOf('Full Name of Holder') !== -1 || text.indexOf('Nama Penuh Pemegang') !== -1) {
            // Table row check
            var tr = cells[i].closest('tr');
            if (tr) {
                var nextTr = tr.nextElementSibling;
                if (nextTr) {
                    var nextCells = nextTr.querySelectorAll('td');
                    if (nextCells.length > 0) {
                        var nameCandidate = nextCells[nextCells.length - 1].textContent.trim();
                        if (nameCandidate && nameCandidate.length > 2) {
                            pilotName = nameCandidate;
                            break;
                        }
                    }
                }
            }
            // Sibling check
            var parent = cells[i].parentElement;
            if (parent) {
                var parentText = parent.textContent.replace('Full Name of Holder', '').replace('(Nama Penuh Pemegang)', '').trim();
                parentText = parentText.replace(/\s+/g, ' ').trim();
                if (parentText && parentText.length > 2) {
                    pilotName = parentText;
                    break;
                }
            }
        }
    }

    // 2. Fetch body text completely cleaned of scripts, styles, and tags
    var rawBodyText = doc.body.textContent || "";
    var bodyText = rawBodyText.replace(/\s+/g, " ");

    // 3. Resilient Name Extraction Fallback
    if (pilotName === "Unknown Pilot") {
        var nameMatch = bodyText.match(/Full Name of Holder\s*(?:\([^)]*\)\s*)*[^A-Za-z]*\s*([A-Za-z\s\.\'\-]+?)\s*[^A-Za-z]*\s*(?:\s+(?:IVc|Date of Birth|Tarikh Lahir|Address|Alamat|Nationality|MALAYSIAN)|$)/i);
        if (nameMatch && nameMatch[1]) {
            pilotName = nameMatch[1].trim();
        }
    }

    // Clean up name noise characters
    pilotName = pilotName.replace(/^[|\|\s\-\.\'\#\:\*]+/, '').replace(/[|\|\s\-\.\'\#\:\*]+$/, '').trim();

    // 4. Resilient License Number Extraction (Precision Section III match)
    var licMatchIII = bodyText.match(/III\s+LICENCE\s+NO\s*([A-Z0-9\/\s\-]+?)\s*(?=\s*\(Nombor|$)/i);
    var licMatchBackup = bodyText.match(/Licence\s*No\s*(?:Nombor\s*Lesen\s*(?:Baru|Lama)?)?\s*([A-Z0-9\/\s\-]+?)\s*(?=\s*(?:Old|Licence|Nombor|Lesen|IVa|XIc|$))/i);
    
    if (licMatchIII && licMatchIII[1] && licMatchIII[1].trim().length > 1) {
        pilotLicense = "Licence No: " + licMatchIII[1].trim();
    } else if (licMatchBackup && licMatchBackup[1] && licMatchBackup[1].trim().length > 1) {
        var val = licMatchBackup[1].trim();
        if (val.toUpperCase() !== "NOMBOR" && val.toUpperCase() !== "NEW" && val.toUpperCase() !== "BARU") {
            pilotLicense = "Licence No: " + val;
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
        
        var rowNormalized = rowText.replace(/\s+/g, '');
        if (rowNormalized.indexOf('CLASS1(SC)') !== -1) return;

        var tds = getDirectChildCells(tr);
        var labelText = "";
        for (var i = 0; i < tds.length; i++) {
            var text = tds[i].textContent.replace('•', '').trim();
            if (!text) continue;
            if (!(/^\d{1,2}\s+[a-zA-Z]{3,10}\s+\d{4}$/.test(text) || text.toUpperCase() === 'NO EXPIRY')) {
                labelText = text;
                break;
            }
        }

        if (!labelText) return;

        tds.forEach(td => {
            var text = td.textContent.trim();
            var isDatePattern = /^\d{1,2}\s+[a-zA-Z]{3,10}\s+\d{4}$/.test(text) || text.toUpperCase() === 'NO EXPIRY';
            if (isDatePattern && !shouldIgnore(td)) {
                var key = labelText.toUpperCase().replace(/\s+/g, '');
                var parsedDate = parseLicenseDate(text);
                var isExpired = isRedOrExpired(td) || isRedOrExpired(tr) || rowText.indexOf('EXPIRED') !== -1;
                registerQualification(key, labelText, text, parsedDate, isExpired);
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

    // Update Big Display Banner
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
