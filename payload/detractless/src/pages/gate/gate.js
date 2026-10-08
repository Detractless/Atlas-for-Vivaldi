import '../../styles/base.css';
import '../../styles/tokens.css';
import '../../styles/themes.css';
import './gate.css';
import { resolveActiveTheme } from '../../utils/themeResolver.js';
import { formatTimeCompact } from '../../utils/formatDuration.js';
import { extractSearchQuery, detectSearchEngine } from './searchQuery.js';
import { storageGet } from '../../services/storage.js';

function applyThemeDOM(theme) {
  document.documentElement.dataset.theme = theme;
  document.body.className = 'theme-' + theme;
}

const urlParams = new URLSearchParams(window.location.search)
const searchUrl = urlParams.get("url")
let timerInterval
let isRedirecting = false
let searchDelayMs = 0

function loadTheme() {
  try {
    storageGet('sync', ['Theme']).then(function(result) {
      const cfg = result.Theme || {}
      let active = resolveActiveTheme(cfg)
      if (active !== 'light') active = 'dark'
      applyThemeDOM(active)
    })
  } catch (e) {
    console.log('Could not load theme')
  }
}

// Display search query if enabled
function displaySearchQuery() {
  storageGet('sync', ['showQueryOnDelay']).then(function(result) {
    const showQuery = result.showQueryOnDelay || false
    
    if (showQuery && searchUrl) {
      const queryDisplay = document.getElementById('query-display')
      const queryText = document.getElementById('query-text')
      const engineIcon = document.getElementById('engine-icon')
      const engineName = document.getElementById('engine-name')
      
      const query = extractSearchQuery(searchUrl)
      const engine = detectSearchEngine(searchUrl)
      
      if (query) {
        queryText.textContent = decodeURIComponent(query)
        engineName.textContent = `on ${engine.name}`
        
        if (engine.icon) {
          engineIcon.src = chrome.runtime.getURL(engine.icon)
          engineIcon.alt = engine.name
          engineIcon.style.display = 'block'
        } else {
          engineIcon.style.display = 'none'
        }
        
        queryDisplay.style.display = 'flex'
      }
    }
  })
}

// Check delay status from background
function checkDelayStatus(callback) {
  chrome.runtime.sendMessage(
    { action: "checkDelayStatus", url: searchUrl },
    function(response) {
      if (chrome.runtime.lastError) {
        console.error("Error checking delay status:", chrome.runtime.lastError)
        callback({ inDelay: false })
        return
      }
      callback(response || { inDelay: false })
    }
  )
}

// Start countdown timer
function startTimer(remainingSeconds) {
  let timeLeft = remainingSeconds
  
  function updateDisplay() {
    if (timeLeft <= 0) {
      clearInterval(timerInterval)
      showRevealButton()
      return
    }
    
    const timeDisplay = document.getElementById('time-remaining')
    if (timeDisplay) {
      timeDisplay.textContent = formatTimeCompact(timeLeft)
    }
    document.title = `(${formatTimeCompact(timeLeft)}) - Search Delay`
    timeLeft--
  }
  
  updateDisplay()
  timerInterval = setInterval(updateDisplay, 1000)
}

// Show reveal button
function showRevealButton() {
  document.getElementById('timer-container').style.display = 'none'
  document.getElementById('reveal-container').style.display = 'block'
  document.title = "(0:00) - Search Delay Complete"
}

// Mark URL as completed and redirect
function markUrlAsCompleted() {
  if (isRedirecting) return
  isRedirecting = true
  
  // Visual feedback: Disable button immediately
  const btn = document.getElementById("reveal-button");
  if(btn) {
    btn.textContent = "Opening...";
    btn.style.opacity = "0.7";
    btn.style.cursor = "wait";
  }
  
  chrome.runtime.sendMessage(
    { action: "markDelayCompleted", url: searchUrl },
    function() {
      if (chrome.runtime.lastError) {
        console.log("Error marking delay completed:", chrome.runtime.lastError)
        // Reset state on error so user can try again
        isRedirecting = false;
        if(btn) {
            btn.textContent = "Reveal Results";
            btn.style.opacity = "1";
            btn.style.cursor = "pointer";
        }
        return;
      }
      
      // Set flag in session storage to prevent redirect loop
      sessionStorage.setItem("redirecting_" + searchUrl, "true")
      
      // Redirect to search results using replace to keep history clean
      window.location.replace(searchUrl)
    }
  )
}

// Initialize page
function initializeDelayPage() {
  // Check if we're in a redirect loop
  if (searchUrl && sessionStorage.getItem("redirecting_" + searchUrl)) {
    sessionStorage.removeItem("redirecting_" + searchUrl)
    window.location.replace(searchUrl)
    return
  }

  // Set up reveal button
  const revealButton = document.getElementById("reveal-button")
  if (revealButton) {
    revealButton.addEventListener("click", markUrlAsCompleted)
  }

  // Check delay status
  checkDelayStatus((status) => {
    if (status.completed) {
      // Already completed, redirect immediately
      document.title = "(0:00) - Search Delay Complete"
      setTimeout(() => {
        window.location.replace(searchUrl)
      }, 500)
    } else if (!status.inDelay) {
      // Not in delay (shouldn't happen), redirect back
      window.location.replace(searchUrl)
    } else if (status.showRevealButton) {
      // Timer expired, show reveal button
      showRevealButton()
    } else {
      // Start countdown timer
      startTimer(status.remainingSeconds)
    }
  })
}

// DOM loaded event
document.addEventListener("DOMContentLoaded", () => {
  // Load theme first
  loadTheme()
  
  // Display search query if enabled
  displaySearchQuery()
  
  storageGet('sync', ["searchDelaySeconds"]).then((result) => {
    searchDelayMs = (result.searchDelaySeconds || 0) * 1000
    initializeDelayPage()
  })
})

// Clean up on page unload
window.addEventListener("beforeunload", () => {
  if (timerInterval) {
    clearInterval(timerInterval)
  }
})