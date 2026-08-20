//--------------------------- //
// ECLIPSE LICENCE CHECKER - ENHANCED VERSION 9.0 //
// Version: 9.0 / Rel: 08/26 //
// AUTHOR: MOHD SALLEHUDDIN ZAIDY (Enhanced by Gemini Notebook) //
//--------------------------- //

window.runLicenseChecker = function(callback, daysThreshold) {
    // 1. Remove existing overlay if shortcut is triggered multiple times
    var existingOverlay = document.getElementById('license-checker-overlay');
    if (existingOverlay) existingOverlay.remove();

    // Support configurable expiry threshold (datum)
    var threshold = 30; // Default
    if (typeof daysThreshold === 'number') {
        threshold = daysThreshold;
    } else if (typeof window.licenseCheckerThreshold === 'number') {
        threshold = window.licenseCheckerThreshold;
    }

    // --- Custom Deduplication Helper (ES5 Compatible) ---\n"
    function uniqueArray(arr) {
        var hash = {};
        var result = [];
        for (var i = 0; i < arr.length; i++) {
            if (!hash[arr[i]]) {
                hash[arr[i]] = true;
                result.push(arr[i]);
            }
        }
        return result;
    }

    // --- Date Parsing Helper Functions ---
    

    // Helper: Checks if an element is nested under an element with id="pg2"
    function isUnderPg2(el) {
        if (!el) return false;
        if (typeof el.closest === 'function') {
            return el.closest('#pg2') !== null;
        }
        var curr = el;
        while (curr) {
            if (curr.id === 'pg2') return true;
            curr = curr.parentElement;
        }
        return false;
    }

    // Parses date strings in 'DD MMM YYYY' format (e.g., '31 JUL 2027', '31 Jul 2027')
    function parseLicenseDate(dateStr) {
        if (!dateStr) return null;
        var trimmed = dateStr.trim();
        if (trimmed.toUpperCase() === 'NO EXPIRY' || trimmed.toUpperCase() === 'NIL' || trimmed.toUpperCase() === 'NA') {
            return null;
        }
        
        // Regex to match "DD MMM YYYY" format
        var match = trimmed.match(/^(\d{1,2})\s+([a-zA-Z]{3,10})\s+(\d{4})$/);
        if (!match) return null;
        
        var day = parseInt(match[1], 10);
        var monthStr = match[2].toUpperCase();
        var year = parseInt(match[3], 10);
        
        // Support English and Malay month abbreviations
        var months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
        var monthsMalay = ["JAN", "FEB", "MAC", "APR", "MEI", "JUN", "JUL", "OGOS", "SEP", "OKT", "NOV", "DIS"];
        
        var monthIdx = months.indexOf(monthStr);
        if (monthIdx === -1) {
            monthIdx = monthsMalay.indexOf(monthStr);
        }
        if (monthIdx === -1) return null;
        
        return new Date(year, monthIdx, day);
    }

    // Helper: Finds the first non-date, non-empty text cell in a row to use as the qualification name
    // Helper: Gets only the immediate TD/TH child elements of a TR (fully ES5 and cross-platform safe)
    function getDirectChildCells(tr) {
        var cells = [];
        if (tr && tr.children) {
            for (var i = 0; i < tr.children.length; i++) {
                var child = tr.children[i];
                var tagName = child.tagName.toUpperCase();
                if (tagName === 'TD' || tagName === 'TH') {
                    cells.push(child);
                }
            }
        }
        if (cells.length === 0 && tr) {
            var qcells = tr.querySelectorAll('td, th');
            for (var j = 0; j < qcells.length; j++) {
                cells.push(qcells[j]);
            }
        }
        return cells;
    }

    function getLabelFromRow(tr) {
        var tds = getDirectChildCells(tr);
        for (var i = 0; i < tds.length; i++) {
            var text = tds[i].textContent.replace('•', '').trim();
            if (!text) continue;
            
            // Check if it matches a date pattern or 'NO EXPIRY'
            var isDatePattern = /^\d{1,2}\s+[a-zA-Z]{3,10}\s+\d{4}$/.test(text) || text.toUpperCase() === 'NO EXPIRY';
            if (!isDatePattern) {
                return text;
            }
        }
        return "";
    }

    // --- Rule-Based Filter Function (to ignore non-qualification dates) ---
    function shouldIgnore(el) {
        if (!el) return true;
        if (isUnderPg2(el)) return true; // Skip elements under pg2
        
        var text = el.textContent.trim();
        if (!text) return true;
        
        var upperText = text.toUpperCase();
        
        // Rule: "INITIAL GRANT" date = 03.09.2012
        if (upperText.indexOf("INITIAL GRANT") !== -1 || upperText.indexOf("INITIAL_GRANT") !== -1) {
            return true;
        }
        
        // Rule: a hidden text inside the page source code = 7 December 1944 (and Malay translation)
        if (upperText.indexOf("7 DECEMBER 1944") !== -1 || 
            upperText.indexOf("7 DISEMBER 1944") !== -1 || 
            upperText.indexOf("DECEMBER 1944") !== -1 || 
            upperText.indexOf("DISEMBER 1944") !== -1) {
            return true;
        }
        
        // Rule: ignore timestamp patterns like "15:16:30" (helps ignore Signature and Sync dates)
        if (/\d{1,2}:\d{2}:\d{2}/.test(text)) {
            return true;
        }
        
        // Traverse up to 5 levels to check context labels
                // Traverse up to 5 levels to check context labels
        var curr = el;
        for (var i = 0; i < 5; i++) {
            if (!curr) break;
            
            // CRITICAL FIX: Check and break at table container levels BEFORE evaluating aggregated text content.
            // This prevents reading texts of other rows (like DOB, signatures, sync dates) inside giant layout tables.
            var tagName = curr.tagName.toUpperCase();
            if (tagName === 'TABLE' || tagName === 'TBODY' || tagName === 'THEAD' || tagName === 'BODY' || tagName === 'HTML' || tagName === 'TR' || tagName === 'TFOOT') {
                break;
            }
            
            if (tagName === 'DIV') {
                var className = (curr.className || '').toLowerCase();
                if (className.indexOf('row') !== -1 || 
                    className.indexOf('container') !== -1 || 
                    className.indexOf('col-') !== -1 || 
                    className.indexOf('card') !== -1) {
                    break;
                }
            }
            
            var currText = curr.textContent.toUpperCase();
            
            // Rule: "Date of Birth" = 12 DEC 1980 / 26 Mar 1996
            if (currText.indexOf("DATE OF BIRTH") !== -1 || currText.indexOf("TARIKH LAHIR") !== -1) {
                return true;
            }
            
            // Rule: date and timestamp between the ceo's signature and "Signature of Issuing Officer" label
            if (currText.indexOf("SIGNATURE OF ISSUING OFFICER") !== -1 || currText.indexOf("TANDATANGAN PEGAWAI") !== -1) {
                return true;
            }
            
            // Rule: "Last synchronization date." = 19 AUG 2026 15:30:35
            if (currText.indexOf("LAST SYNCHRONIZATION") !== -1 || currText.indexOf("PENYELARASAN TERAKHIR") !== -1) {
                return true;
            }
            
            // Rule: "INITIAL GRANT" in parent context
            if (currText.indexOf("INITIAL GRANT") !== -1) {
                return true;
            }

            // Rule: Chicago / ICAO convention references
            if (currText.indexOf("CHICAGO CONVENTION") !== -1 || currText.indexOf("ANNEX 1") !== -1 || currText.indexOf("ANEKS 1") !== -1) {
                return true;
            }
            
            curr = curr.parentElement;
        }
        
        // Rule: date falls under the "Validity Issue Date" in FCL table: ATPL(A) | 31 JUL 2026 | 31 JUL 2027
        // We check if this element is inside the second cell of a 3-cell table row
        var tr = el.closest('tr');
        if (tr) {
            var rowText = tr.textContent.toUpperCase();
            if (rowText.indexOf("VALIDITY ISSUE DATE") !== -1 || rowText.indexOf("TARIKH KELUARAN") !== -1) {
                return true; // Ignore the header row itself
            }
            
            var tds = getDirectChildCells(tr);
            if (tds.length === 3) {
                // Check if this table actually has a "Validity Issue Date" header
                var table = tr.closest('table');
                var hasIssueDateHeader = false;
                if (table) {
                    var tableText = table.textContent.toUpperCase();
                    if (tableText.indexOf("VALIDITY ISSUE DATE") !== -1 || tableText.indexOf("TARIKH KELUARAN") !== -1) {
                        hasIssueDateHeader = true;
                    }
                }
                
                // If it does have that header, then tds[1] is indeed the "Validity Issue Date" column
                if (hasIssueDateHeader && (tds[1] === el || tds[1].contains(el))) {
                    return true;
                }
            }
        }
        
        return false;
    }

    // Helper function: Enhanced detection for red text, red background (#FF0000), or EXPIRED status
    function isRedOrExpired(el) {
        if (!el) return false;
        var text = el.textContent.trim().toUpperCase();
        if (text === 'EXPIRED') return true;
        
        var inlineStyle = (el.getAttribute('style') || '').toLowerCase();
        if (inlineStyle.includes('color: red') || 
            inlineStyle.includes('color:red') || 
            inlineStyle.includes('color: #ff0000') || 
            inlineStyle.includes('background: #ff0000') || 
            inlineStyle.includes('background:#ff0000') || 
            inlineStyle.includes('background: red') || 
            inlineStyle.includes('background-color: red')) {
            return true;
        }
        
        var style = window.getComputedStyle(el);
        // Check computed text color
        var matchColor = style.color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (matchColor) {
            var r = parseInt(matchColor[1], 10), g = parseInt(matchColor[2], 10), b = parseInt(matchColor[3], 10);
            if (r > 180 && r > g + 50 && r > b + 50) return true;
        }
        // Check computed background color
        var matchBg = style.backgroundColor.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (matchBg) {
            var r = parseInt(matchBg[1], 10), g = parseInt(matchBg[2], 10), b = parseInt(matchBg[3], 10);
            if (r > 180 && r > g + 50 && r > b + 50) return true;
        }
        return false;
    }

    // --- State and Data Management ---
    // Rule 1: Use the current device date as the point-in-time calculation reference
    var refDate = new Date();
    var qualificationData = {};
    var processedKeys = {};

    function processQualification(labelText, dateText, parsedDate, isVisuallyExpired) {
        var name = labelText || "Qualification";
        var key = name.toUpperCase().replace(/\s+/g, '');
        
        // EXCEPTION: Class 1(SC) or Class 1SC or Class 1 (SC)
        if (key.indexOf('CLASS1(SC)') !== -1 || key.indexOf('CLASS1SC') !== -1 || key.indexOf('CLASS1(S.C.)') !== -1) {
            return;
        }
        
        name = name.replace('•', '').trim();
        
        var status = "VALID";
        var daysRemaining = null;
        
        if (isVisuallyExpired) {
            status = "EXPIRED";
        } else if (parsedDate) {
            // Calculate differences in days
            var timeDiff = parsedDate.getTime() - refDate.getTime();
            daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
            
            if (daysRemaining < 0) {
                status = "EXPIRED";
            } else if (daysRemaining <= threshold) {
                status = "EXPIRING_SOON";
            }
        }
        
        // If already recorded and marked expired, preserve the higher severity
        if (qualificationData[key] && qualificationData[key].status === "EXPIRED") {
            return;
        }
        
        qualificationData[key] = {
            name: name,
            dateText: dateText,
            parsedDate: parsedDate,
            daysRemaining: daysRemaining,
            status: status
        };
    }

    // --- Extraction Pass 1: Card Components ---
    var cards = document.querySelectorAll('.card');
    for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        if (isUnderPg2(card)) continue; // Skip cards under pg2
        var cardText = card.textContent.toUpperCase();
        
        // CRITICAL FIX: Skip outer layout cards (which contain tables processed by Pass 2)
        if (cardText.indexOf('MEDICAL EXPIRY DATE') !== -1 || 
            cardText.indexOf('TARIKH TAMAT TEMPOH PERUBATAN') !== -1 ||
            cardText.indexOf('LICENCE TYPE') !== -1 ||
            cardText.indexOf('VALIDITY EXPIRY DATE') !== -1) {
            continue;
        }
        var cardNormalized = cardText.replace(/\s+/g, ''); if (cardNormalized.indexOf('CLASS1(SC)') !== -1 || cardNormalized.indexOf('CLASS1SC') !== -1 || cardNormalized.indexOf('CLASS1(S.C.)') !== -1) continue;
        
        var titleEl = card.querySelector('.col-sm-12 .bg-gray-300') || 
                      card.querySelector('div[style*="font-weight: 500"]') || 
                      card.querySelector('.fs-5');
                      
        var labelText = titleEl ? titleEl.textContent.trim() : "";
        var dateEl = card.querySelector('.text-uppercase b') || 
                     card.querySelector('.fs-4 b, .fs-3 b');
                     
        var dateText = dateEl ? dateEl.textContent.trim() : "";
        
        if (labelText && dateText) {
            if (shouldIgnore(dateEl)) continue;
            var key = labelText.toUpperCase().replace(/\s+/g, '');
            processedKeys[key] = true;
            
            var parsedDate = parseLicenseDate(dateText);
            var isVisExpired = isRedOrExpired(dateEl) || cardText.indexOf('EXPIRED') !== -1;
            
            processQualification(labelText, dateText, parsedDate, isVisExpired);
        }
    }

    // --- Extraction Pass 2: Table Components ---
    var rows = document.querySelectorAll('tr');
    for (var i = 0; i < rows.length; i++) {
        var tr = rows[i];
        if (isUnderPg2(tr)) continue; // Skip rows under pg2
        var rowText = tr.textContent.toUpperCase();
        var rowNormalized = rowText.replace(/\s+/g, ''); if (rowNormalized.indexOf('CLASS1(SC)') !== -1 || rowNormalized.indexOf('CLASS1SC') !== -1 || rowNormalized.indexOf('CLASS1(S.C.)') !== -1) continue;
        
        // CRITICAL FIX: Skip header rows and outer table structures
        if (rowText.indexOf('LICENCE TYPE') !== -1 || rowText.indexOf('VALIDITY EXPIRY DATE') !== -1) continue; // Skip FCL header
        if (rowText.indexOf('MEDICAL CLASS') !== -1 || rowText.indexOf('KELAS PERUBATAN') !== -1) continue;     // Skip Medical header
        if (rowText.indexOf('MEDICAL EXPIRY DATE') !== -1 || rowText.indexOf('TARIKH TAMAT TEMPOH PERUBATAN') !== -1) continue; // Skip Medical layout row
        
        var labelText = getLabelFromRow(tr);
        if (!labelText) continue;
        
        var tds = getDirectChildCells(tr);
        
        // Search inside row cells for any text that matches a date pattern or NO EXPIRY
        for (var j = 0; j < tds.length; j++) {
            var tdText = tds[j].textContent.trim();
            var isDatePattern = /^\d{1,2}\s+[a-zA-Z]{3,10}\s+\d{4}$/.test(tdText) || tdText.toUpperCase() === 'NO EXPIRY';
            
            if (isDatePattern) {
                if (shouldIgnore(tds[j])) continue;
                var key = labelText.toUpperCase().replace(/\s+/g, '');
                processedKeys[key] = true;
                
                var parsedDate = parseLicenseDate(tdText);
                var isVisExpired = isRedOrExpired(tds[j]) || isRedOrExpired(tr) || rowText.indexOf('EXPIRED') !== -1;
                
                processQualification(labelText, tdText, parsedDate, isVisExpired);
            }
        }
    }

    // --- Extraction Pass 3: General Fallback (Backwards Compatibility Safety Net) ---
    var elements = document.querySelectorAll('b, span, td, div, p, font, strong');
    for (var i = 0; i < elements.length; i++) {
        var el = elements[i];
        if (isUnderPg2(el)) continue; // Skip elements under pg2
        if (el.children.length === 0 && el.textContent.trim().length > 0) {
            if (shouldIgnore(el)) continue;
            if (isRedOrExpired(el)) {
                var labelText = "";
                var dateText = el.textContent.trim();
                var tr = el.closest('tr');
                var card = el.closest('.card');
                
                if (tr) {
                    var rowNormalized = tr.textContent.toUpperCase().replace(/\s+/g, '');
                    if (rowNormalized.indexOf('CLASS1(SC)') !== -1 || rowNormalized.indexOf('CLASS1SC') !== -1 || rowNormalized.indexOf('CLASS1(S.C.)') !== -1) continue;
                    
                    var labelTd = tr.querySelector('.text-left') || tr.querySelector('td');
                    if (labelTd) {
                        labelText = labelTd.textContent.replace('•', '').trim();
                    }
                } else if (card) {
                    var cardNormalized = card.textContent.toUpperCase().replace(/\s+/g, '');
                    if (cardNormalized.indexOf('CLASS1(SC)') !== -1 || cardNormalized.indexOf('CLASS1SC') !== -1 || cardNormalized.indexOf('CLASS1(S.C.)') !== -1) continue;
                    
                    var titleEl = card.querySelector('.col-sm-12 .bg-gray-300') || 
                                  card.querySelector('div[style*="font-weight: 500"]') || 
                                  card.querySelector('.fs-5');
                    if (titleEl) {
                        labelText = titleEl.textContent.trim();
                    }
                    var dateEl = card.querySelector('.text-uppercase b') || 
                                 card.querySelector('.fs-4 b, .fs-3 b');
                    if (dateEl) {
                        dateText = dateEl.textContent.trim();
                    }
                }
                
                if (!labelText) {
                    labelText = "Qualification";
                }
                
                var key = labelText.toUpperCase().replace(/\s+/g, '');
                if (!qualificationData[key]) {
                    var parsedDate = parseLicenseDate(dateText);
                    processQualification(labelText, dateText, parsedDate, true);
                } else {
                    qualificationData[key].status = "EXPIRED";
                }
            }
        }
    }

    // --- Split results into UI lists ---
    var expiredDisplayList = [];
    var expiringSoonDisplayList = [];
    var rawExpiredNames = []; // For iOS shortcut / Android return

    for (var k in qualificationData) {
        var item = qualificationData[k];
        if (item.status === "EXPIRED") {
            expiredDisplayList.push("<b>" + item.name + "</b> : " + item.dateText + " <span style='color: #ef4444; font-weight: bold;'>(EXPIRED)</span><br>");
            rawExpiredNames.push(item.name + " : " + item.dateText);
        } else if (item.status === "EXPIRING_SOON") {
            // Enhanced "Expiring Soon" formatting with "(X days left)"
            var daysText = " (" + item.daysRemaining + " days left)";
            if (item.daysRemaining === 1) {
                daysText = " (1 day left)";
            }
            expiringSoonDisplayList.push("<b>" + item.name + "</b> : " + item.dateText + " <span style='color: #ea580c; font-weight: bold;'>" + daysText + "</span><br>");
        }
    }

    // Deduplicate outputs using ES5-safe function
    expiredDisplayList = uniqueArray(expiredDisplayList);
    expiringSoonDisplayList = uniqueArray(expiringSoonDisplayList);
    rawExpiredNames = uniqueArray(rawExpiredNames);

    // --- UI OVERLAY CREATION ---
    var overlay = document.createElement('div');
    overlay.id = 'license-checker-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.zIndex = '999999';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    overlay.style.backdropFilter = 'blur(6px)';
    overlay.style.webkitBackdropFilter = 'blur(6px)';

    function closeOverlay() {
        overlay.remove();
        document.body.style.overflow = '';
    }

    overlay.onclick = function(e) {
        if (e.target === overlay) closeOverlay();
    };

    var alertBox = document.createElement('div');
    alertBox.style.padding = '24px';
    alertBox.style.borderRadius = '16px';
    alertBox.style.backgroundColor = '#ffffff';
    alertBox.style.boxShadow = '0 20px 40px rgba(0,0,0,0.3)';
    alertBox.style.textAlign = 'center';
    alertBox.style.maxWidth = '85%';
    alertBox.style.minWidth = '290px';

    // UI Status Routing (Critical Expired -> Warning Expiring Soon -> OK Valid)
    var statusConfig = {};
    if (expiredDisplayList.length > 0) {
        // Red critical state
        //var detailsHTML = "<b>[ EXPIRED CREDENTIALS ]</b><br>" + expiredDisplayList.join('');
        var detailsHTML = '<span style="background: #2c3e50; color: white; padding: 2px 2px; border-radius: 2px; font-weight: bold; font-size: 14px; display: inline-block;">EXPIRED CREDENTIALS</span><br>' + expiredDisplayList.join('');
        if (expiringSoonDisplayList.length > 0) {
            detailsHTML += "<br><b>[ EXPIRING SOON ]</b><br>" + expiringSoonDisplayList.join('');
        }
        statusConfig = {
            overlayBg: 'rgba(235, 50, 35, 0.35)',
            badgeBg: '#ef4444',
            icon: '!',
            titleColor: '#d32f2f',
            titleText: 'Qualification Expired / Invalid',
            tagBg: '#ef4444',
            tagText: 'DO NOT FLY!',
            detailsText: detailsHTML
        };
    } else if (expiringSoonDisplayList.length > 0) {
        // Orange/Amber warning state
        statusConfig = {
            overlayBg: 'rgba(245, 158, 11, 0.35)',
            badgeBg: '#f97316',
            icon: '!',
            titleColor: '#c2410c',
            titleText: 'Qualification Expiring Soon',
            tagBg: '#f97316',
            tagText: 'PROCEED WITH CAUTION!',
            detailsText: "<b>[ EXPIRING SOON ]</b><br>" + expiringSoonDisplayList.join('')
        };
    } else {
        // Green valid state
        statusConfig = {
            overlayBg: 'rgba(46, 125, 50, 0.35)',
            badgeBg: '#22c55e',
            icon: '✓',
            titleColor: '#2e7d32',
            titleText: 'All Qualifications Valid',
            tagBg: '#22c55e',
            tagText: 'HAVE A SAFE FLIGHT!',
            detailsText: 'All checked licence qualifications are valid.'
        };
    }

    overlay.style.backgroundColor = statusConfig.overlayBg;

    // Header Container (using pure ES5 string concatenation)
    var headerContainer = document.createElement('div');
    headerContainer.style.marginBottom = '16px';
    headerContainer.innerHTML = 
        '<div style="display: flex; align-items: center; justify-content: center; gap: 12px;">' +
        '  <div style="background: ' + statusConfig.badgeBg + '; border-radius: 50%; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-weight: bold; font-size: 18px; color: white;">' +
             statusConfig.icon +
        '  </div>' +
        '  <div style="text-align: left;">' +
        '    <h2 style="margin: 0; font-size: 17px; color: ' + statusConfig.titleColor + '; font-weight: 700; line-height: 1.2;">' + statusConfig.titleText + '</h2>' +
        '    <div style="margin-top: 4px;">' +
        '      <span style="background: ' + statusConfig.tagBg + '; color: white; padding: 2px 10px; border-radius: 4px; font-weight: 800; font-size: 17px; letter-spacing: 0.5px; display: inline-block;">' + statusConfig.tagText + '</span>' +
        '    </div>' +
        '  </div>' +
        '</div>';

    // Details List Box
    var details = document.createElement('div');
    details.style.fontSize = '14px';
    details.style.color = '#2c3e50';
    details.style.textAlign = 'left';
    details.style.whiteSpace = 'pre-line';
    details.style.maxHeight = '40vh';
    details.style.overflowY = 'auto';
    details.style.padding = '12px';
    details.style.backgroundColor = '#f8f9fa';
    details.style.borderRadius = '10px';
    details.style.lineHeight = '1.5';
    details.innerHTML = statusConfig.detailsText;

    // Disclaimer
    var disclaimer = document.createElement('div');
    disclaimer.style.marginTop = '16px';
    disclaimer.style.lineHeight = '1.4';
    disclaimer.style.fontWeight = 'bold';
    disclaimer.innerHTML = 
        '<div style="font-size: 12px; color: #dc2626;">REMINDER : ALWAYS RE-CHECK AND VERIFY!</div>' +
        '<div style="font-weight: normal; font-size: 11px; color: #64748b;">Crew cross-checkings are still required.</div>';

    // Button
    var button = document.createElement('button');
    button.innerText = 'Close';
    button.style.marginTop = '14px';
    button.style.padding = '10px 24px';
    button.style.fontSize = '15px';
    button.style.fontWeight = '600';
    button.style.border = 'none';
    button.style.borderRadius = '8px';
    button.style.backgroundColor = '#007aff';
    button.style.color = '#ffffff';
    button.style.cursor = 'pointer';
    button.onclick = closeOverlay;

    // Assemble elements
    alertBox.appendChild(headerContainer);
    alertBox.appendChild(details);
    alertBox.appendChild(disclaimer);
    alertBox.appendChild(button);
    overlay.appendChild(alertBox);
    document.body.appendChild(overlay);

    // Call callback or completion safely (cross-platform bridges)
    if (typeof callback === 'function') {
        callback(rawExpiredNames);
    } else if (typeof completion === 'function') {
        completion(rawExpiredNames);
    } else {
        console.log('Expired items:', rawExpiredNames);
    }
};
