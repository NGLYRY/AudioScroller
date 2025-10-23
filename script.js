console.log("script.js works hooray!");

const musicContainer = document.getElementById('music-container')
const playBtn = document.getElementById('play')
const replaySecondBtn = document.getElementById('replaySecond')
const backwardBtn = document.getElementById('backward') 

const audio = document.getElementById('audio')
const speedSlider = document.getElementById('speedSlider');
const currentSpeed = document.getElementById('currentSpeed');
const maxSourcesInput = document.getElementById('maxSourcesInput');
const currentMaxSources = document.getElementById('currentMaxSources');

let audioContext;
let audioSource;
let gainNode;
let isWebAudioConnected = false;

let speed = 1.0; // Default speed
const progress = document.getElementById('progress')
const progressContainer = document.getElementById('progress-container')
const currTime = document.querySelector('#currTime');
const durTime = document.querySelector('#durTime');

const songs = ['selectedpoems_01_furlong_64kb', 'selectedpoems_02_furlong_64kb', 'selectedpoems_03_furlong_64kb', 'round.mp3'];

// Keep track of song
let songIndex = 1;
let secIndex = 3;

// Variable to track if we're in replay mode
let isReplayingSecond = false;
let replayTimeout;

// ===== BACKWARD PLAYBACK SYSTEM =====
// Configuration
const BackwardConfig = {
    MIN_SPEED: 0.1,
    MAX_SPEED: 4.0,
    SEGMENT_DURATION_SEC: 2,
    SEGMENT_INTERVAL_MS: 1500,
    SEGMENT_STEP_SEC: 2,
    MAX_ACTIVE_SOURCES: 3
};

// Backward playback state
let accumulatedScroll = 0.0;
let currentVirtualSpeed = 1.0;
let manualPause = false;
let backwardMode = false;
let clickBoostActive = false;
let virtualPosition = 0;
let lastCCWTime = 0;

// Backward playback variables
let backwardTimer = null;
let lastSources = [];
let audioBuffer = null;

// Initialize Web Audio API
function initWebAudio() {
    try {
        // Create AudioContext only after user interaction
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // Create gain node for volume control
        if (!gainNode) {
            gainNode = audioContext.createGain();
        }
        
        // Connect audio element to Web Audio API
        if (!isWebAudioConnected && audio) {
            audioSource = audioContext.createMediaElementSource(audio);
            audioSource.connect(gainNode);
            gainNode.connect(audioContext.destination);
            isWebAudioConnected = true;
        }
        
        console.log('Web Audio API initialized successfully');
        return true;
    } catch (error) {
        console.error('Web Audio API not supported:', error);
        return false;
    }
}

// Load audio buffer for backward playback
async function loadAudioBuffer() {
    if (audioBuffer) return audioBuffer;
    
    try {
        console.log('Loading audio buffer for backward playback...');
        const response = await fetch(audio.src);
        const arrayBuffer = await response.arrayBuffer();
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        console.log('Audio buffer loaded successfully');
        return audioBuffer;
    } catch (error) {
        console.error('Error loading audio buffer:', error);
        return null;
    }
}

// Play a segment of audio (for backward mode)
function playSegment(startTime, duration, playbackRate = 1.0) {
    if (!audioBuffer || !audioContext) {
        console.error('Cannot play segment: Audio buffer or context not ready');
        return null;
    }
    
    try {
        const source = audioContext.createBufferSource();
        const gainNode = audioContext.createGain();
        
        source.buffer = audioBuffer;
        source.playbackRate.value = playbackRate;
        
        // Connect and start
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Set volume
        gainNode.gain.value = 1.0;
        
        // Play the segment
        source.start(0, startTime, duration);
        
        const segmentData = {
            source: source,
            gainNode: gainNode,
            startTime: startTime,
            duration: duration
        };
        
        // Auto-cleanup when segment ends
        source.onended = () => {
            console.log('Segment ended:', startTime.toFixed(2), 'to', (startTime + duration).toFixed(2));
        };
        
        return segmentData;
    } catch (error) {
        console.error('Error playing segment:', error);
        return null;
    }
}

// Stop all active sources
function stopAllSources(sources) {
    sources.forEach(item => {
        try {
            if (item.source) {
                item.source.stop();
                item.source.disconnect();
            }
            if (item.gainNode) {
                item.gainNode.disconnect();
            }
        } catch (e) {
            // Ignore errors from already stopped sources
        }
    });
    return [];
}

// Play a backward segment
function playBackwardSegment(endPosition) {
    console.log('Playing backward segment at position:', endPosition.toFixed(2));
    
    // Don't play new segments if manually paused
    if (manualPause) {
        console.log('Skipping backward segment - manual pause active');
        return false;
    }
    
    // Get current max sources from user input
    const currentMaxSources = parseInt(maxSourcesInput.value) || 2;
    
    // Clean up old sources if we have too many
    if (lastSources.length >= currentMaxSources) {
        console.log(`Cleaning up older sources (count: ${lastSources.length}, max: ${currentMaxSources})`);
        const oldestSource = lastSources.shift();
        try {
            if (oldestSource.source) oldestSource.source.stop();
            if (oldestSource.gainNode) oldestSource.gainNode.disconnect();
        } catch (e) {
            // Ignore errors from already stopped sources
        }
    }
    
    if (!audioBuffer) {
        console.error('Cannot play backward segment: Audio buffer not loaded');
        return false;
    }
    
    // Calculate segment boundaries
    const segmentEnd = Math.min(audioBuffer.duration, Math.max(0, endPosition));
    const segmentStart = Math.max(0, segmentEnd - BackwardConfig.SEGMENT_DURATION_SEC);
    const segmentDuration = segmentEnd - segmentStart;
    
    console.log(`Segment: ${segmentStart.toFixed(2)}s to ${segmentEnd.toFixed(2)}s (${segmentDuration.toFixed(2)}s)`);
    
    if (segmentDuration < 0.05) {
        console.warn('Segment too short, skipping');
        return false;
    }
    
    const segmentData = playSegment(segmentStart, segmentDuration, 1.0);
    if (segmentData) {
        lastSources.push(segmentData);
        return true;
    }
    
    return false;
}

// Start backward playback mode
function startBackwardMode() {
    console.log('Starting backward playback mode at position:', virtualPosition.toFixed(2));
    
    // Ensure audio context is ready
    if (!audioContext || audioContext.state === 'suspended') {
        console.log('Audio context not ready, attempting to resume...');
        resumeAudioContext().then(() => {
            if (backwardMode) {
                setTimeout(() => startBackwardMode(), 100);
            }
        });
        return false;
    }
    
    // Stop any existing timer
    if (backwardTimer) {
        console.log('Clearing existing backward timer');
        clearInterval(backwardTimer);
        backwardTimer = null;
    }
    
    // Clear any active sources
    console.log('Stopping all active sources');
    lastSources = stopAllSources(lastSources);
    
    // Mute HTML audio element during backward mode
    audio.muted = true;
    
    // Immediately play the first segment at current position
    console.log('Playing first backward segment');
    const success = playBackwardSegment(virtualPosition);
    
    if (!success) {
        console.error('Failed to play initial backward segment');
        backwardMode = false;
        audio.muted = false;
        return false;
    }
    
    // Set up timer to play segments at regular intervals
    console.log('Setting up interval timer for segments every', BackwardConfig.SEGMENT_INTERVAL_MS, 'ms');
    backwardTimer = setInterval(() => {
        // Only add new segments if we're still in backward mode and not paused
        if (!backwardMode) {
            clearInterval(backwardTimer);
            backwardTimer = null;
            return;
        }
        
        // Skip playing new segments if manually paused
        if (manualPause) {
            console.log('Backward playback paused, skipping new segment');
            return;
        }
        
        // Step backward for the next segment
        virtualPosition = Math.max(0, virtualPosition - BackwardConfig.SEGMENT_STEP_SEC);
        
        console.log('Timer triggered: playing segment at position', virtualPosition.toFixed(2));
        playBackwardSegment(virtualPosition);
        
        // Update progress display
        updateProgressDisplay();
    }, BackwardConfig.SEGMENT_INTERVAL_MS);
    
    console.log('Backward mode started successfully');
    return true;
}

// Stop backward playback mode
function stopBackwardMode() {
    console.log('Stopping backward playback mode');
    
    // Clear interval first
    if (backwardTimer) {
        clearInterval(backwardTimer);
        backwardTimer = null;
    }
    
    // Then stop all sources with proper cleanup
    lastSources = stopAllSources(lastSources);
    
    // Reset state
    backwardMode = false;
    audio.muted = false;
    
    return true;
}

// Enter backward mode
async function enterBackwardMode() {
    if (backwardMode) {
        console.log('Already in backward mode');
        return;
    }
    
    console.log('Entering backward mode');
    
    // Initialize Web Audio if needed
    if (!audioContext) {
        const success = initWebAudio();
        if (!success) {
            console.error('Failed to initialize Web Audio API');
            return;
        }
    }
    
    // Ensure audio context is running
    await resumeAudioContext();
    
    // Load audio buffer if not already loaded
    if (!audioBuffer) {
        console.log('Loading audio buffer for backward playback...');
        await loadAudioBuffer();
        if (!audioBuffer) {
            console.error('Failed to load audio buffer');
            return;
        }
    }
    
    // Set backward mode state
    backwardMode = true;
    manualPause = false;
    
    // Store current position and mute main audio
    virtualPosition = audio.currentTime;
    audio.muted = true;
    
    console.log('Starting backward mode from position:', virtualPosition.toFixed(2));
    
    // Start backward playback
    const success = startBackwardMode();
    if (!success) {
        console.error('Failed to start backward mode');
        backwardMode = false;
        audio.muted = false;
    }
    
    // Update button state
    updateBackwardButton();
}

// Exit backward mode
function exitBackwardMode() {
    if (!backwardMode) return;
    
    console.log('Exiting backward mode at position:', virtualPosition.toFixed(2));
    
    // Stop backward playback
    stopBackwardMode();
    
    // Resume normal playback from current virtual position
    audio.currentTime = virtualPosition;
    audio.muted = false;
    
    // Play if it was playing before
    if (!manualPause) {
        audio.play().catch(console.error);
    }
    
    console.log('Resumed forward playback at position:', virtualPosition.toFixed(2));
    
    // Update button state
    updateBackwardButton();
}

// Toggle backward mode
function toggleBackwardMode() {
    if (backwardMode) {
        exitBackwardMode();
    } else {
        enterBackwardMode();
    }
}

// Update backward button appearance
function updateBackwardButton() {
    if (!backwardBtn) return;
    
    if (backwardMode) {
        backwardBtn.classList.add('active');
        backwardBtn.style.backgroundColor = '#ff4444';
    } else {
        backwardBtn.classList.remove('active');
        backwardBtn.style.backgroundColor = '';
    }
}

// Update progress display for backward mode
function updateProgressDisplay() {
    if (!backwardMode) return;
    
    // Update progress bar based on virtual position
    const progressPercent = (virtualPosition / audio.duration) * 100;
    progress.style.width = `${progressPercent}%`;
    
    // Update time display
    updateTimeDisplay(virtualPosition);
}

// Update time display
function updateTimeDisplay(time) {
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    const formattedTime = `${min}:${sec.toString().padStart(2, '0')}`;
    
    if (currTime) {
        currTime.innerHTML = formattedTime;
    }
}
// ===== END BACKWARD PLAYBACK SYSTEM =====

// Resume AudioContext (required for some browsers)
async function resumeAudioContext() {
    if (audioContext && audioContext.state === 'suspended') {
        try {
            await audioContext.resume();
            console.log('AudioContext resumed');
        } catch (error) {
            console.error('Failed to resume AudioContext:', error);
        }
    }
}

// Initially load song details into DOM
loadSong(songs[songIndex]);

function loadSong(song) {
    // Stop backward mode if active
    if (backwardMode) {
        exitBackwardMode();
    }
    
    // Clear audio buffer when loading new song
    audioBuffer = null;
    
    audio.src = `mp3s/${song}.mp3`;
    
    // Preload audio buffer for backward playback
    setTimeout(() => {
        if (audioContext) {
            loadAudioBuffer().catch(console.error);
        }
    }, 1000);
}

async function playSong() {
    // Exit backward mode if active
    if (backwardMode) {
        exitBackwardMode();
    }
    
    // Initialize Web Audio API on first user interaction
    if (!audioContext) {
        const success = initWebAudio();
        if (!success) {
            console.warn('Web Audio API failed to initialize, falling back to basic audio');
        }
    }
    
    // Resume audio context if suspended
    await resumeAudioContext();
    
    musicContainer.classList.add('play');
    playBtn.querySelector('i.fas').classList.remove('fa-play');
    playBtn.querySelector('i.fas').classList.add('fa-pause');
    playBtn.childNodes[0].textContent = 'Pause';
    
    manualPause = false;
    
    try {
        await audio.play();
    } catch (error) {
        console.error('Failed to play audio:', error);
    }
}

function pauseSong() {
    musicContainer.classList.remove('play');
    playBtn.querySelector('i.fas').classList.add('fa-play');
    playBtn.querySelector('i.fas').classList.remove('fa-pause');
    playBtn.childNodes[0].textContent = 'Play';
    
    manualPause = true;
    
    // Pause backward playback if active
    if (backwardMode) {
        // The segments will auto-stop due to manualPause flag
        console.log('Pausing backward playback');
    }
    
    audio.pause();
}

function replayLastSecond() {
    // Exit backward mode if active
    if (backwardMode) {
        exitBackwardMode();
    }
    
    const currentTime = audio.currentTime;
    const replayStartTime = Math.max(0, currentTime - 1); 
    const wasPlaying = !audio.paused;
    
    clearTimeout(replayTimeout);
    
    isReplayingSecond = true;
    
    // Jump back 1 second
    audio.currentTime = replayStartTime;
    
    // Start playing from that point
    if (!wasPlaying) {
        playSong();
    }
    
    // Set timeout to pause after 1 second (or less if near beginning)
    const replayDuration = Math.min(1000, (currentTime - replayStartTime) * 1000);
    
    replayTimeout = setTimeout(() => {
        // If it wasn't playing before, pause it after the replay
        if (!wasPlaying) {
            pauseSong();
        }
        // Reset the flag
        isReplayingSecond = false;
        
        // If it was playing, continue from where we would have been
        if (wasPlaying) {
            audio.currentTime = currentTime;
        }
    }, replayDuration);
}

function updateProgress(e) {
    if (backwardMode) {
        // In backward mode, we update progress display separately
        return;
    }
    
    const { duration, currentTime } = e.srcElement;
    const progressPercent = (currentTime / duration) * 100;
    progress.style.width = `${progressPercent}%`;
    
    // Update virtual position for consistency
    virtualPosition = currentTime;
}

function setProgress(e) {
    if (backwardMode) {
        // Exit backward mode when clicking progress bar
        exitBackwardMode();
    }
    
    const width = this.clientWidth;
    const clickX = e.offsetX;
    const duration = audio.duration;
    const newTime = (clickX / width) * duration;
    
    audio.currentTime = newTime;
    virtualPosition = newTime;
    
    // Automatically start playing when clicking progress bar
    if (audio.paused) {
        playSong();
    }
}

//get duration & currentTime for Time of song
function DurTime (e) {
    if (backwardMode) {
        // In backward mode, we handle time display separately
        return;
    }
    
    const {duration,currentTime} = e.srcElement;
    var sec;
    var sec_d;

    // define minutes currentTime
    let min = (currentTime==null)? 0:
     Math.floor(currentTime/60);
     min = min <10 ? '0'+min:min;

    // define seconds currentTime
    function get_sec (x) {
        if(Math.floor(x) >= 60){
            
            for (var i = 1; i<=60; i++){
                if(Math.floor(x)>=(60*i) && Math.floor(x)<(60*(i+1))) {
                    sec = Math.floor(x) - (60*i);
                    sec = sec <10 ? '0'+sec:sec;
                }
            }
        }else{
         	sec = Math.floor(x);
         	sec = sec <10 ? '0'+sec:sec;
         }
    } 

    get_sec (currentTime,sec);

    // change currentTime DOM - add null check
    if(currTime) currTime.innerHTML = min +':'+ sec;

    // define minutes duration
    let min_d = (isNaN(duration) === true)? '0':
        Math.floor(duration/60);
     min_d = min_d <10 ? '0'+min_d:min_d;


     function get_sec_d (x) {
        if(Math.floor(x) >= 60){
            
            for (var i = 1; i<=60; i++){
                if(Math.floor(x)>=(60*i) && Math.floor(x)<(60*(i+1))) {
                    sec_d = Math.floor(x) - (60*i);
                    sec_d = sec_d <10 ? '0'+sec_d:sec_d;
                }
            }
        }else{
         	sec_d = (isNaN(duration) === true)? '0':
         	Math.floor(x);
         	sec_d = sec_d <10 ? '0'+sec_d:sec_d;
         }
    } 

    // define seconds duration
    
    get_sec_d (duration);

    // change duration DOM - add null check
    if(durTime) durTime.innerHTML = min_d +':'+ sec_d;
        
};

// Speed control
audio.playbackRate = parseFloat(speedSlider.value);
currentSpeed.textContent = `${parseFloat(speedSlider.value).toFixed(1)}x`;

// Debounce function to prevent rapid changes
let speedTimeout;

// Add event listener for slider changes with debouncing
speedSlider.addEventListener('input', () => {
    const newSpeed = parseFloat(speedSlider.value);
    
    // Update display immediately for smooth UI feedback
    currentSpeed.textContent = `${newSpeed.toFixed(1)}x`;
    
    // Clear previous timeout
    clearTimeout(speedTimeout);
    
    // Set new timeout to update playback rate after user stops dragging
    speedTimeout = setTimeout(() => {
        audio.playbackRate = newSpeed;
    }, 100); // 100ms delay
});

// Also handle when user releases the slider (for immediate response)
speedSlider.addEventListener('change', () => {
    clearTimeout(speedTimeout);
    const newSpeed = parseFloat(speedSlider.value);
    audio.playbackRate = newSpeed;
    currentSpeed.textContent = `${newSpeed.toFixed(1)}x`;
});

// Handle max sources input changes
maxSourcesInput.addEventListener('input', () => {
    const newMaxSources = parseInt(maxSourcesInput.value);
    currentMaxSources.textContent = newMaxSources;
    
    // If we're in backward mode and have too many sources, clean up immediately
    if (backwardMode && lastSources.length > newMaxSources) {
        console.log(`Reducing active sources from ${lastSources.length} to ${newMaxSources}`);
        while (lastSources.length > newMaxSources) {
            const oldestSource = lastSources.shift();
            try {
                if (oldestSource.source) oldestSource.source.stop();
                if (oldestSource.gainNode) oldestSource.gainNode.disconnect();
            } catch (e) {
                // Ignore errors from already stopped sources
            }
        }
    }
});

// Event listeners
playBtn.addEventListener('click', () => {
  const isPlaying = musicContainer.classList.contains('play');

  if (isPlaying) {
    pauseSong();
  } else {
    playSong();
  }
});

// Add event listener for replay button
replaySecondBtn.addEventListener('click', replayLastSecond);

// Add event listener for backward button
if (backwardBtn) {
    backwardBtn.addEventListener('click', toggleBackwardMode);
} else {
    console.warn('Backward button not found - make sure to add <button id="backward">Backward</button> to your HTML');
}

// Time/song update
audio.addEventListener('timeupdate', updateProgress);

// Click on progress bar
progressContainer.addEventListener('click', setProgress);

audio.addEventListener('ended', () => {
    pauseSong();
    // Exit backward mode if active
    if (backwardMode) {
        exitBackwardMode();
    }
});

// Time of song
audio.addEventListener('timeupdate', DurTime);

// Add this function to handle initial user interaction
function handleFirstInteraction() {
    if (!audioContext) {
        initWebAudio();
    }
    // Remove the event listeners after first interaction
    document.removeEventListener('click', handleFirstInteraction);
    document.removeEventListener('keydown', handleFirstInteraction);
}

// Add event listeners for first user interaction
document.addEventListener('click', handleFirstInteraction);
document.addEventListener('keydown', handleFirstInteraction);

// Add debugging information
console.log('Current protocol:', window.location.protocol);
console.log('AudioContext support:', !!(window.AudioContext || window.webkitAudioContext));

// Check if running on GitHub Pages
if (window.location.hostname.includes('github.io')) {
    console.log('Running on GitHub Pages');
}