window.runLicenseChecker = function(callback) {
    // --- CONFIGURATION & EXCEPTION LISTS ---
    var WARNING_DAYS = 14; // Alert if expiring within this many days

    var IGNORED_FIELD_KEYWORDS = [
        'DATE OF BIRTH', 'TARIKH LAHIR', 'BIRTH', 'LAHIR', 'D.O.B', 'DOB',
        'NATIONALITY', 'WARGANEGARA', 'GENDER', 'JANTINA',
        'EXAM DATE', 'DATE OF EXAMINATION', 'TARIKH PEPERIKSAAN',
        'APPLICATION DATE', 'TARIKH PERMOHONAN', 'LAST RENEWAL'
    ];

    var ISSUE_DATE_KEYWORDS = [
        'VALIDITY ISSUE DATE', 'ISSUE DATE', 'DATE OF ISSUE', 
        'TARIKH KELUARAN', 'TARIKH DIKELUARKAN', 'TARIKH ISU'
    ];

    var IGNORED_DATES = [
        '01 JAN 1900',
        '00/00/0000'
    ];
    // ---------------------------------------

    var existingOverlay = document.getElementById('license-checker-overlay');
    if (existingOverlay) existingOverlay.remove();

    // Reliable cross-browser date parsing for "DD MMM YYYY"
    function parseCustomDate(dateStr) {
        if (!dateStr) return null;
        var months = { JAN:0, FEB:1, MAR:2, APR:3, MAY:4, JUN:5, JUL:6, AUG:7, SEP:8, OCT:9, NOV:10, DEC:11 };
        var match = dateStr.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/i);
        if (match) {
            var day = parseInt(match[1], 10);
            var mon = months[match[2].toUpperCase()];
            var yr = parseInt(match[3], 10);
            if (mon !== undefined) {
                return new Date(yr, mon, day);
            }
        }
        var fallback = new Date(dateStr);
        return isNaN(fallback.getTime()) ? null : fallback;
    }

    function isRedOrExpired(el) {
        var text = el.textContent.trim().toUpperCase();
        if (text === 'EXPIRED') return true;

        var inlineStyle = (el.getAttribute('style') || '').toLowerCase();
        if (inlineStyle.includes('color: red') || inlineStyle.includes('color:red') || inlineStyle.includes('color: #ff0000') ||
            inlineStyle.includes('background: #ff0000') || inlineStyle.includes('background:#ff0000') || 
            inlineStyle.includes('background: red') || inlineStyle.includes('background-color: red')) {
            return true;
        }

        var style = window.getComputedStyle(el);
        var matchColor = style.color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (matchColor) {
            var r = parseInt(matchColor[1], 10), g = parseInt(matchColor[2], 10), b = parseInt(matchColor[3], 10);
            if (r > 180 && r > g + 50 && r > b + 50) return true;
        }

        var matchBg = style.backgroundColor.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (matchBg) {
            var s = parseInt(matchBg[1], 10), u = parseInt(matchBg[2], 10), p = parseInt(matchBg[3], 10);
            if (s > 180 && s > u + 50 && s > p + 50) return true;
        }
        return false;
    }

    function getColumnHeader(el) {
        var td = el.closest('td, th');
        if (!td) return '';
        var tr = td.parentElement;
        if (!tr) return '';
        var cellIndex = Array.prototype.indexOf.call(tr.children, td);
        
        var table = tr.closest('table');
        if (!table) return '';
        
        var headerTr = table.querySelector('thead tr') || table.querySelector('tr');
        if (headerTr && headerTr !== tr && headerTr.children[cellIndex]) {
            return headerTr.children[cellIndex].textContent.trim().toUpperCase();
        }
        return '';
    }

    function getImmediateLabel(el) {
        var label = getColumnHeader(el);
        
        var td = el.closest('td, th');
        if (td && td.previousElementSibling) {
            label += " " + td.previousElementSibling.textContent;
        }
        
        if (el.previousElementSibling) {
            label += " " + el.previousElementSibling.textContent;
        }
        
        return label.toUpperCase().replace(/\s+/g, ' ');
    }

    function getRowLeadLabel(el) {
        var td = el.closest('td, th');
        if (!td) return '';
        var tr = td.parentElement;
        if (!tr) return '';
        
        var firstTd = tr.children[0];
        if (firstTd && firstTd !== td) {
            var txt = firstTd.textContent.replace('•', '').trim();
            if (txt.length > 0) return txt;
        }
        return '';
    }

    function findLabelText(el) {
        var leadLabel = getRowLeadLabel(el);
        if (leadLabel) return leadLabel;

        var tr = el.closest('tr');
        if (tr) {
            var tds = tr.querySelectorAll('td');
            for (var i = 0; i < tds.length; i++) {
                var txt = tds[i].textContent.trim();
                if (txt.length > 0 && !tds[i].contains(el)) {
                    return txt.replace('•', '').trim();
                }
            }
        }
        
        var card = el.closest('.card');
        if (card) {
            var titleEl = card.querySelector('.col-sm-12 .bg-gray-300') || 
                          card.querySelector('div[style*="font-weight: 500"]') || 
                          card.querySelector('.fs-5');
            if (titleEl) return titleEl.textContent.trim();
        }
        return "Qualification";
    }

    var elements = document.querySelectorAll('b, span, td, div, p, font, strong');
    var expiredItemsMap = {};
    var warningItemsMap = {};

    for (var i = 0; i < elements.length; i++) {
        var el = elements[i];
        if (el.children.length === 0 && el.textContent.trim().length > 0) {
            
            var text = el.textContent.trim();
            var isRed = isRedOrExpired(el);
            
            var dateMatch = text.match(/\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/i);
            var isDate = !!dateMatch;
            
            if (isRed || isDate || text.toUpperCase() === 'EXPIRED') {
                var dateText = isDate ? dateMatch[0] : text;
                var isException = false;
                
                var colHeader = getColumnHeader(el);
                var immediateLabel = getImmediateLabel(el);

                // 1. Column Header check: Ignore if under Issue Date header
                for (var h = 0; h < ISSUE_DATE_KEYWORDS.length; h++) {
                    if (colHeader.includes(ISSUE_DATE_KEYWORDS[h])) {
                        isException = true;
                        break;
                    }
                }

                // 2. Immediate Label check: Ignore static fields (DOB, etc.)
                if (!isException) {
                    for (var k = 0; k < IGNORED_FIELD_KEYWORDS.length; k++) {
                        if (immediateLabel.includes(IGNORED_FIELD_KEYWORDS[k])) {
                            isException = true;
                            break;
                        }
                    }
                }

                // 3. Ignore timestamps
                if (/\b\d{1,2}:\d{2}(:\d{2})?\b/.test(text)) {
                    isException = true;
                }

                // 4. Ignore CEO signature block
                if (document.querySelector('.ceosignature') && (el.closest('.ceosignature') || (el.closest('tr') && el.closest('tr').querySelector('.ceosignature')))) {
                    isException = true;
                }

                // 5. Ignore static placeholder dates
                if (IGNORED_DATES.indexOf(dateText.toUpperCase()) !== -1) {
                    isException = true;
                }

                if (!isException) {
                    var labelText = findLabelText(el);
                    labelText = labelText.replace(/\s+/g, ' ');
                    var status = "VALID";
                    
                    if (isRed || text.toUpperCase() === 'EXPIRED') {
                        status = "EXPIRED";
                    } 
                    
                    if (isDate) {
                        var d = parseCustomDate(dateMatch[0]);
                        if (d) {
                            var now = new Date();
                            now.setHours(0,0,0,0);
                            d.setHours(0,0,0,0);
                            
                            var diffDays = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                            
                            if (diffDays < 0) {
                                status = "EXPIRED";
                            } else if (diffDays <= WARNING_DAYS) {
                                if (status !== "EXPIRED") {
                                    status = "WARNING";
                                }
                            }

                            if (status === "WARNING") {
                                var dayString = diffDays === 1 ? 'day' : 'days';
                                dateText = dateMatch[0] + " <span style='color:#b45309; font-size: 0.85em; font-weight: bold;'>(" + diffDays + " " + dayString + " left)</span>";
                            }
                        }
                    }

                    if (status === "EXPIRED") {
                        expiredItemsMap[labelText] = labelText + " : <b>" + dateText + "</b>";
                        delete warningItemsMap[labelText];
                    } else if (status === "WARNING") {
                        if (!expiredItemsMap[labelText]) {
                            warningItemsMap[labelText] = labelText + " : <b>" + dateText + "</b>";
                        }
                    }
                }
            }
        }
    }

    var expiredItems = Object.values(expiredItemsMap);
    var warningItems = Object.values(warningItemsMap);

    var overlay = document.createElement('div');
    overlay.id = 'license-checker-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';

    function closeOverlay() {
        overlay.remove();
        document.body.style.overflow = '';
    }

    overlay.onclick = function(e) { if (e.target === overlay) closeOverlay(); };

    var alertBox = document.createElement('div');
    alertBox.style.cssText = 'padding:24px;border-radius:16px;background-color:#ffffff;box-shadow:0 20px 40px rgba(0,0,0,0.3);text-align:center;max-width:85%;min-width:290px;';

    var statusConfig = {};
    
    if (expiredItems.length > 0) {
        var comboList = expiredItems.slice();
        if (warningItems.length > 0) {
            comboList.push('<hr style="margin: 12px 0; border: none; border-top: 1px dashed #cbd5e1;">');
            comboList = comboList.concat(warningItems);
        }
        statusConfig = {
            overlayBg: 'rgba(235, 50, 35, 0.35)',
            badgeBg: '#ef4444',
            icon: '!',
            titleColor: '#d32f2f',
            titleText: 'Qualification Expired / Invalid',
            tagBg: '#ef4444',
            tagText: 'DO NOT FLY!',
            detailsText: comboList.join('\n\n')
        };
    } else if (warningItems.length > 0) {
        statusConfig = {
            overlayBg: 'rgba(245, 158, 11, 0.35)',
            badgeBg: '#f59e0b',
            icon: '⚠️',
            titleColor: '#b45309',
            titleText: 'Action Required Soon',
            tagBg: '#f59e0b',
            tagText: 'EXPIRING IN ≤ ' + WARNING_DAYS + ' DAYS',
            detailsText: warningItems.join('\n\n')
        };
    } else {
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
    document.body.style.overflow = 'hidden';

    var headerContainer = document.createElement('div');
    headerContainer.style.marginBottom = '16px';
    headerContainer.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; gap: 12px;">
        <div style="background: ${statusConfig.badgeBg}; border-radius: 50%; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-weight: bold; font-size: 18px; color: white;">${statusConfig.icon}</div>
        <div style="text-align: left;">
          <h2 style="margin: 0; font-size: 17px; color: ${statusConfig.titleColor}; font-weight: 700; line-height: 1.2;">${statusConfig.titleText}</h2>
          <div style="margin-top: 4px;"><span style="background: ${statusConfig.tagBg}; color: white; padding: 2px 8px; border-radius: 4px; font-weight: 800; font-size: 13px; letter-spacing: 0.5px; display: inline-block;">${statusConfig.tagText}</span></div>
        </div>
      </div>`;

    var details = document.createElement('div');
    details.style.cssText = 'font-size:15px;color:#2c3e50;text-align:left;white-space:pre-line;max-height:45vh;overflow-y:auto;padding:12px;background-color:#f8f9fa;border-radius:10px;';
    details.innerHTML = statusConfig.detailsText;

    var disclaimer = document.createElement('div');
    disclaimer.style.cssText = 'margin-top:16px;line-height:1.4;font-weight:bold;';
    disclaimer.innerHTML = `<div style="font-size: 12px; color: #dc2626;">REMINDER : PLEASE RE-VERIFY MANUALLY!</div><div style="font-weight: normal; font-size: 11px; color: #64748b;">This checker <b>DOES NOT</b> replace<br>manual cross-checking.</div>`;

    var button = document.createElement('button');
    button.innerText = 'Close';
    button.style.cssText = 'margin-top:14px;padding:12px 28px;font-size:16px;font-weight:600;border:none;border-radius:10px;background-color:#007aff;color:#ffffff;';
    button.onclick = closeOverlay;

    alertBox.appendChild(headerContainer);
    alertBox.appendChild(details);
    alertBox.appendChild(disclaimer);
    alertBox.appendChild(button);
    overlay.appendChild(alertBox);
    document.body.appendChild(overlay);

    if (typeof callback === 'function') {
        callback({ expired: expiredItems, warnings: warningItems });
    }
};
