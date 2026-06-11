// content.js

const DEBUG_MODE = false; // Set to true to see the red visual debugger and prevent tab auto-closing

const isSearchPage = window.location.href.includes('/search/results/people');
const isProfilePage = window.location.href.includes('/in/');
const autoConnect = new URLSearchParams(window.location.search).get('autoConnect') === 'true';

if (isSearchPage) {
  observeSearchPage();
} else if (isProfilePage && autoConnect) {
  handleAutoConnect();
}

function observeSearchPage() {
  setInterval(() => {
    const actionElements = Array.from(document.querySelectorAll('a, button, [role="button"]')).filter(el => {
      const text = el.innerText.trim();
      return ['Message', 'Follow', 'Pending', 'Connect'].includes(text);
    });

    actionElements.forEach(actionEl => {
      const actionText = actionEl.innerText.trim();

      if (actionText === 'Connect' || actionText === 'Pending') return;

      const listItem = actionEl.closest('li, [role="listitem"]');
      if (!listItem) return;

      const hasConnect = Array.from(listItem.querySelectorAll('a, button, [role="button"]')).some(el => {
        const t = el.innerText.trim();
        return ['Connect', 'Pending'].includes(t);
      });
      if (hasConnect) return;

      if (listItem.querySelector('.direct-connect-btn')) return;

      let profileLinkEl = actionEl.closest('a[href*="/in/"]');
      if (!profileLinkEl) {
        profileLinkEl = listItem.querySelector('a[href*="/in/"]');
      }

      if (!profileLinkEl) return;
      const profileUrl = profileLinkEl.href;

      const targetContainer = actionEl.parentElement;

      const btnContainer = document.createElement('div');
      btnContainer.className = 'direct-connect-btn';
      btnContainer.style.display = 'inline-block';
      btnContainer.style.marginLeft = '8px';

      const btn = document.createElement('button');
      btn.className = actionEl.className;
      btn.innerHTML = actionEl.innerHTML;

      function replaceText(element, oldText, newText) {
        for (let node of element.childNodes) {
          if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() === oldText) {
            node.nodeValue = node.nodeValue.replace(oldText, newText);
            return true;
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            if (replaceText(node, oldText, newText)) return true;
          }
        }
        return false;
      }

      if (!replaceText(btn, actionText, 'Direct Connect')) {
        btn.innerText = 'Direct Connect';
      }

      const icon = btn.querySelector('svg, img, .artdeco-button__icon');
      if (icon) icon.remove();

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        replaceText(btn, 'Direct Connect', 'Connecting...');
        btn.disabled = true;

        try {
          chrome.runtime.sendMessage({
            action: 'OPEN_PROFILE_AND_CONNECT',
            profileUrl: profileUrl
          });
        } catch (error) {
          if (error.message.includes('Extension context invalidated')) {
            alert('DirectConnect was updated! Please refresh this LinkedIn page to continue.');
            replaceText(btn, 'Connecting...', 'Error (Refresh)');
            return;
          }
          console.error(error);
        }

        setTimeout(() => {
          replaceText(btn, 'Connecting...', 'Sent');
        }, 8000);
      });

      btnContainer.appendChild(btn);

      targetContainer.style.display = 'flex';
      targetContainer.style.flexDirection = 'row';
      targetContainer.style.alignItems = 'center';

      targetContainer.appendChild(btnContainer);
    });
  }, 1000);
}

async function handleAutoConnect() {
  if (DEBUG_MODE) {
    const debugBox = document.createElement('div');
    debugBox.style.cssText = `
      position: fixed; top: 10px; right: 10px; width: 320px; height: 500px;
      background: rgba(0,0,0,0.9); color: #0f0; z-index: 999999;
      padding: 10px; font-family: monospace; font-size: 12px;
      overflow-y: auto; border: 2px solid red; pointer-events: none;
    `;
    document.body.appendChild(debugBox);

    window.logDebug = function (msg) {
      console.log(msg);
      const line = document.createElement('div');
      line.innerText = new Date().toLocaleTimeString() + ' - ' + msg;
      line.style.borderBottom = '1px solid #333';
      line.style.paddingBottom = '4px';
      line.style.marginBottom = '4px';
      debugBox.appendChild(line);
      debugBox.scrollTop = debugBox.scrollHeight;
    };
  } else {
    window.logDebug = function (msg) {
      console.log('DirectConnect: ' + msg);
    };
  }

  logDebug('DirectConnect: Auto-connect process started');
  logDebug('Waiting 2.5s for LinkedIn (React) to hydrate event listeners...');
  await sleep(2500);

  let connectBtn = null;
  let moreBtn = null;

  for (let i = 0; i < 25; i++) {
    connectBtn = findConnectButton();
    if (connectBtn) break;

    moreBtn = findMoreButton();
    if (moreBtn) break;

    await sleep(200);
  }

  if (connectBtn) {
    logDebug(`Found direct Connect button! Text: "${connectBtn.innerText.trim()}"`);
    connectBtn.click();
    await handleSendModal();
    return;
  }

  if (moreBtn) {
    logDebug('Found More button. Clicking...');
    moreBtn.focus();
    moreBtn.click();
    simulateClick(moreBtn);

    logDebug('Searching for Connect option in dropdown...');
    let dropdownConnect = null;
    for (let i = 0; i < 20; i++) {
      dropdownConnect = findDropdownItemForConnect();
      if (dropdownConnect) {
        logDebug(`Found Connect! Tag: ${dropdownConnect.tagName}, HTML: ${dropdownConnect.outerHTML.substring(0, 50)}...`);
        break;
      }
      await sleep(100);
    }
    if (dropdownConnect) {
      logDebug(`Found Connect in dropdown! Text: "${dropdownConnect.innerText.trim()}"`);
      dropdownConnect.focus();
      dropdownConnect.click();
      simulateClick(dropdownConnect);
      await handleSendModal();
      return;
    } else {
      logDebug('Connect option NOT found in More dropdown');
    }
  } else {
    logDebug('Could not find More button');
  }

  logDebug('Could not find any way to connect');
}

// Search inside Web Components / Shadow DOM
function querySelectorAllDeep(selector, root = document) {
  let results = Array.from(root.querySelectorAll(selector));
  const allElements = root.querySelectorAll('*');
  for (let el of allElements) {
    if (el.shadowRoot) {
      results = results.concat(querySelectorAllDeep(selector, el.shadowRoot));
    }
  }
  return results;
}

async function handleSendModal() {
  let sendBtn = null;
  let modalFound = false;

  for (let i = 0; i < 25; i++) {
    const allBtns = querySelectorAllDeep('button');

    // Check if any modal is open
    const modal = document.querySelector('.artdeco-modal, [role="dialog"]');
    if (modal && !modalFound) {
      modalFound = true;
      logDebug('Modal detected! Scanning buttons...');
    }

    sendBtn = allBtns.find(b => {
      const t = b.textContent.trim().toLowerCase();
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();

      if (t === 'send without a note' || aria === 'send without a note') return true;
      if (b.closest('.artdeco-modal, [role="dialog"]') && (t === 'send' || aria === 'send' || t === 'send now')) {
        return true;
      }
      return false;
    });

    if (sendBtn) {
      const rect = sendBtn.getBoundingClientRect();
      if (rect.width > 0) {
        logDebug(`Found Send button! Text: "${sendBtn.innerText.trim()}"`);
        break;
      }
      sendBtn = null;
    }

    await sleep(200);
  }

  if (sendBtn) {
    logDebug(`SUCCESS: Send button ready. Disabled? ${sendBtn.disabled}`);
    if (sendBtn.disabled) await sleep(1000);

    logDebug('Clicking send button (brute-force)...');
    try {
      sendBtn.focus();
      sendBtn.click();
      if (sendBtn.firstElementChild) {
        sendBtn.firstElementChild.click();
        simulateClick(sendBtn.firstElementChild);
      }
      simulateClick(sendBtn);
      sendBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      sendBtn.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      logDebug('Click sequence finished.');
    } catch (e) {
      logDebug(`Error during click: ${e.message}`);
    }

    await sleep(1500);
  } else {
    logDebug('FAIL: Could not find Send button after 5 seconds.');
    const modal = document.querySelector('.artdeco-modal, [role="dialog"]');
    if (modal) {
      logDebug('MODAL HTML: ' + modal.innerHTML.substring(0, 150));
      const textNodes = Array.from(querySelectorAllDeep('*', modal)).map(el => el.innerText?.trim()).filter(t => t && t.length > 3 && t.length < 50);
      logDebug('Modal text hints: ' + [...new Set(textNodes)].slice(0, 5).join(' | '));
      const btns = Array.from(querySelectorAllDeep('button', modal)).map(b => b.innerText.trim()).filter(Boolean);
      logDebug('Modal buttons available: ' + btns.join(' | '));
    } else {
      logDebug('No modal was found on the screen. Dropdown click may have failed.');
    }
  }

  if (!DEBUG_MODE) {
    chrome.runtime.sendMessage({ action: 'CLOSE_CURRENT_TAB' });
  }
}

function simulateClick(element) {
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
  element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
}

function findConnectButton() {
  const container = document.querySelector('main') || document;
  const buttons = Array.from(container.querySelectorAll('button, a, [role="button"]'));
  return buttons.find(b => {
    // Exclude right rail completely so we don't click "People you may know"
    if (b.closest('aside, .scaffold-layout__aside, .right-rail')) return false;

    const rect = b.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    const t = b.innerText.trim().toLowerCase();
    const aria = (b.getAttribute('aria-label') || '').toLowerCase();

    // Check innerText. Needs to contain 'connect' as an isolated word (ignores "connections")
    if (/\bconnect\b/.test(t) && !t.includes('remove') && !t.includes('withdraw') && !t.includes('connections') && !t.includes('following')) {
      if (t.length < 50) return true;
    }

    // Check aria-label for hidden payloads (e.g. "Invite Aparna Lal to connect")
    if (/\bconnect\b/.test(aria) && !aria.includes('remove') && !aria.includes('withdraw') && !aria.includes('connections')) {
      return true;
    }

    return false;
  });
}

function findMoreButton() {
  const container = document.querySelector('main') || document;
  const buttons = Array.from(container.querySelectorAll('button'));
  return buttons.find(b => {
    const rect = b.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const aria = (b.getAttribute('aria-label') || '').toLowerCase();
    return aria.includes('more actions') || aria === 'more';
  });
}

function findDropdownItemForConnect() {
  const items = Array.from(document.querySelectorAll('.artdeco-dropdown__item, [role="menuitem"], .pvs-profile-actions__action, div[aria-label*="Connect"]'));
  return items.find(i => {
    const rect = i.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const t = i.innerText.trim().toLowerCase();
    const aria = (i.getAttribute('aria-label') || '').toLowerCase();
    return (t.includes('connect') || aria.includes('connect')) &&
      !t.includes('remove') && !t.includes('withdraw') &&
      !aria.includes('remove') && !aria.includes('withdraw');
  });
}

function findButtonByTextOrAria(text) {
  const buttons = Array.from(document.querySelectorAll('button'));
  const lowerText = text.toLowerCase();
  return buttons.find(b => {
    const rect = b.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const t = b.innerText.trim().toLowerCase();
    const aria = (b.getAttribute('aria-label') || '').toLowerCase();
    return t === lowerText || aria === lowerText || t.includes(lowerText);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
