//---------------------------  //
//  ECLIPSE LICENCE CHECKER    //
//  Version: 0.1 / Rel: 08/26  //
//  AUTHOR: MOHD SALLEHUDDIN ZAIDY

window.runLicenseChecker = function(callback) {

// 1. Remove existing overlay if shortcut is triggered multiple times
var existingOverlay = document.getElementById('license-checker-overlay');
if (existingOverlay) existingOverlay.remove();

var expiredItems = [];

// Helper function: Enhanced detection for red text, red background (#FF0000), or EXPIRED status
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

// 2. Query text containers
var elements = document.querySelectorAll('b, span, td, div, p, font, strong');

for (var i = 0; i < elements.length; i++) {
    var el = elements[i];
    
    // Evaluate leaf elements containing text
    if (el.children.length === 0 && el.textContent.trim().length > 0) {
        if (isRedOrExpired(el)) {
            var dateText = el.textContent.trim();
            var isException = false;
            var labelText = "";

            var tr = el.closest('tr');
            var card = el.closest('.card');

            // 1. TABLE LAYOUT (Medical & Licence Types)
            if (tr) {
                var rowNormalized = tr.textContent.toUpperCase().replace(/\s+/g, '');
                
                // EXCEPTION: Class 1(SC)
                if (rowNormalized.includes('CLASS1(SC)') || rowNormalized.includes('CLASS1SC')) {
                    isException = true;
                } else {
                    var labelTd = tr.querySelector('.text-left') || tr.querySelector('td');
                    if (labelTd) {
                        labelText = labelTd.textContent.replace('•', '').trim();
                    }
                }
            } 
            // 2. CARD LAYOUT (ELP, Type Ratings, IR, Radiotelephony)
            else if (card) {
                var cardNormalized = card.textContent.toUpperCase().replace(/\s+/g, '');
                
                if (cardNormalized.includes('CLASS1(SC)')) {
                    isException = true;
                } else {
                    // Extract Title (supports .col-sm-12 .bg-gray-300, font-weight: 500, and .fs-5)
                    var titleEl = card.querySelector('.col-sm-12 .bg-gray-300') || 
                                  card.querySelector('div[style*="font-weight: 500"]') || 
                                  card.querySelector('.fs-5');
                    if (titleEl) {
                        labelText = titleEl.textContent.trim();
                    }

                    // Targeted selector: Bypasses <b>Expiry Date</b> label and targets actual date in .text-uppercase
                    var dateEl = card.querySelector('.text-uppercase b') || 
                                 card.querySelector('.fs-4 b, .fs-3 b');
                    if (dateEl) {
                        dateText = dateEl.textContent.trim();
                    }
                }
            }

            if (!labelText) {
                labelText = "Qualification";
            }

            labelText = labelText.replace(/\s+/g, ' ');

            if (!isException) {
                // Formatted so dateText renders bold
                expiredItems.push(labelText + " : <b style='text-transform: uppercase'>" + dateText + "</b>");
            }
        }
    }
}

// Deduplicate list
expiredItems = [...new Set(expiredItems)];

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

// Close Overlay Helper
function closeOverlay() {
    overlay.remove();
    document.body.style.overflow = '';
}

// Dismiss overlay when tapping backdrop
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

// Status Configuration Object
var statusConfig = expiredItems.length > 0 ? {
    overlayBg: 'rgba(235, 50, 35, 0.35)',
    badgeBg: '#ef4444',
    icon: '!',
    titleColor: '#d32f2f',
    titleText: 'Qualification Expired / Invalid',
    tagBg: '#ef4444',
    tagText: 'DO NOT FLY!',
    detailsText: expiredItems.join('\n\n')
} : {
    overlayBg: 'rgba(46, 125, 50, 0.35)',
    badgeBg: '#22c55e',
    icon: '✓',
    titleColor: '#2e7d32',
    titleText: 'All Qualifications Valid',
    tagBg: '#22c55e',
    tagText: 'HAVE A SAFE FLIGHT!',
    detailsText: 'All checked licence qualifications are valid.'
};

// Set Overlay Background & Lock Body Scroll
overlay.style.backgroundColor = statusConfig.overlayBg;
//document.body.style.overflow = 'hidden';

// Header Container
var headerContainer = document.createElement('div');
headerContainer.style.marginBottom = '16px';
headerContainer.innerHTML = `
  <div style="display: flex; align-items: center; justify-content: center; gap: 12px;">
    <div style="background: ${statusConfig.badgeBg}; border-radius: 50%; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-weight: bold; font-size: 18px; color: white;">
      ${statusConfig.icon}
    </div>
    <div style="text-align: left;">
      <h2 style="margin: 0; font-size: 17px; color: ${statusConfig.titleColor}; font-weight: 700; line-height: 1.2;">${statusConfig.titleText}</h2>
      <div style="margin-top: 4px;">
        <span style="background: ${statusConfig.tagBg}; color: white; padding: 2px 10px; border-radius: 4px; font-weight: 800; font-size: 17px; letter-spacing: 0.5px; display: inline-block;">${statusConfig.tagText}</span>
      </div>
    </div>
  </div>
`;

// Details List Box
var details = document.createElement('div');
details.style.fontSize = '15px';
details.style.color = '#2c3e50';
details.style.textAlign = 'left';
details.style.whiteSpace = 'pre-line';
details.style.maxHeight = '45vh';
details.style.overflowY = 'auto';
details.style.padding = '12px';
details.style.backgroundColor = '#f8f9fa';
details.style.borderRadius = '10px';
details.innerHTML = statusConfig.detailsText; // Uses innerHTML to render <b> tags
//details.style.textTransform = 'uppercase';
    
// 2-Line Disclaimer Element
var disclaimer = document.createElement('div');
disclaimer.style.marginTop = '16px';
disclaimer.style.lineHeight = '1.4';
disclaimer.style.fontWeight = 'bold';
disclaimer.innerHTML = `
  <div style="font-size: 12px; color: #dc2626;">REMINDER : ALWAYS RE-CHECK AND VERIFY!</div>
  <div style="font-weight: normal; font-size: 11px; color: #64748b;">Crew cross-checkings are still required.</div>
`;

// Dismiss Button
var button = document.createElement('button');
button.innerText = 'Close';
button.style.marginTop = '14px';
button.style.padding = '12px 28px';
button.style.fontSize = '16px';
button.style.fontWeight = '600';
button.style.border = 'none';
button.style.borderRadius = '10px';
button.style.backgroundColor = '#007aff';
button.style.color = '#ffffff';
button.onclick = closeOverlay;

// Assemble elements
alertBox.appendChild(headerContainer);
alertBox.appendChild(details);
alertBox.appendChild(disclaimer);
alertBox.appendChild(button);
overlay.appendChild(alertBox);
document.body.appendChild(overlay);

//completion(expiredItems);
// Cross-platform safe completion call
if (typeof completion === 'function') {
    completion(expiredItems);
} else {
    console.log('Expired items detected:', expiredItems);
}

}
