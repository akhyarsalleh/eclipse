window.runLicenseChecker = function(callback) {
    // --- CONFIGURATION & EXCEPTION LISTS ---
    var WARNING_DAYS = 14; // Alert if expiring within this many days

    // 1. Ignore specific qualification labels that represent static/issue dates
    var IGNORED_KEYWORDS = [
        'CLASS1(SC)',
        'CLASS1SC',
        'CPL(A)',
        'ATPL(A)',
        'DATE OF ISSUE',
        'ISSUE DATE',
        'DATE OF BIRTH',
        'EXAM DATE',
        'DATE OF EXAMINATION',
        'APPLICATION DATE',
        'LAST RENEWAL'
    ];

    // 2. Ignore exact static date strings if needed
    var IGNORED_DATES = [
        '01 Jan 1900',
        '00/00/0000'
    ];
    // ---------------------------------------

    var existingOverlay = document.getElementById('license-checker-overlay');
    if (existingOverlay) existingOverlay.remove();

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

    var elements = document.querySelectorAll('b, span, td, div, p, font, strong');
    var expiredItemsMap = {};
    var warningItemsMap = {};

    for (var i = 0; i < elements.length; i++) {
        var el = elements[i];
        if (el.children.length === 0 && el.textContent.trim().length > 0) {
            
            var text = el.textContent.trim();
            var isRed = isRedOrExpired(el);
            
            // Regex to find date formats like "10 AUG 2026" or "13 Aug 2025"
            var dateMatch = text.match(/\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/i);
            var isDate = !!dateMatch;
            
            if (isRed || isDate || text.toUpperCase() === 'EXPIRED') {
                var dateText = isDate ? dateMatch[0] : text;
                var labelText = "";
                var isException = false;
                
                var tr = el.closest('tr');
                var card = el.closest('.card');
                
                if (tr) {
                    var labelTd = tr.querySelector('.text-left') || tr.querySelector('td');
                    if (labelTd) labelText = labelTd.textContent.replace('•', '').trim();
                } else if (card) {
                    var titleEl = card.querySelector('.col-sm-12 .bg-gray-300') || 
                                  card.querySelector('div[style*="font-weight: 500"]') || 
                                  card.querySelector('.fs-5');
                    if (titleEl) labelText = titleEl.textContent.trim();

                    if (!isDate && text.toUpperCase() !== 'EXPIRED') {
                         var dateEl = card.querySelector('.text-uppercase b') || card.querySelector('.fs-4 b, .fs-3 b');
                         if (dateEl) dateText = dateEl.textContent.trim();
                    }
                }

                if (!labelText) labelText = "Qualification";
                labelText = labelText.replace(/\s+/g, ' ');

                // --- EXCEPTION CHECKS ---
                
                // 1. Keyword check on label, row, or card
                var fullRowText = tr ? tr.textContent.toUpperCase() : '';
                var fullCardText = card ? card.textContent.toUpperCase() : '';
                var upperLabel = labelText.toUpperCase();

                for (var k = 0; k < IGNORED_KEYWORDS.length; k++) {
                    var kw = IGNORED_KEYWORDS[k];
                    if (upperLabel.includes(kw) || fullRowText.includes(kw) || fullCardText.includes(kw)) {
                        isException = true;
                        break;
                    }
                }

                // 2. Ignore timestamps containing time components (e.g. "22:34:34")
                if (/\b\d{1,2}:\d{2}(:\d{2})?\b/.test(text)) {
                    isException = true;
                }

                // 3. Ignore signature blocks (.ceosignature)
                if (document.querySelector('.ceosignature') && (el.closest('.ceosignature') || (tr && tr.querySelector('.ceosignature')))) {
                    isException = true;
                }

                // 4. Ignore explicit static date strings
                if (IGNORED_DATES.indexOf(dateText) !== -1) {
                    isException = true;
                }

                // --- END EXCEPTION CHECKS ---

                if (!isException) {
                    var status = "VALID";
                    
                    if (isRed || text.toUpperCase() === 'EXPIRED') {
                        status = "EXPIRED";
                    } 
                    
                    if (isDate) {
                        var d = new Date(dateMatch[0]);
                        var now = new Date();
                        now.setHours(0,0,0,0);
                        
                        var diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                        
                        if (diffDays < 0) {
                            status = "EXPIRED";
                        } else if (diffDays <= WARNING_DAYS) {
                            if (status !== "EXPIRED") {
                                status = "WARNING";
                            }
                            var dayString = diffDays === 1 ? 'day' : 'days';
                            var dayStyle = status === "EXPIRED" ? "color:#dc2626;" : "color:#b45309;";
                            dateText = dateMatch[0] + " <span style='" + dayStyle + " font-size: 0.85em; font-weight: bold;'>(" + diffDays + " " + dayString + " left)</span>";
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
