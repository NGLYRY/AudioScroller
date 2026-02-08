const musicContainer = document.getElementById('music-container')
const playBtn = document.getElementById('play')
const replaySecondBtn = document.getElementById('replaySecond')
const backwardBtn = document.getElementById('backward')

const audio = document.getElementById('audio')
const speedSlider = document.getElementById('speedSlider');
const currentSpeed = document.getElementById('currentSpeed');
const maxSourcesInput = document.getElementById('maxSourcesInput');
const currentMaxSources = document.getElementById('currentMaxSources');

// Backward parameters controls
const segmentLengthInput = document.getElementById('segmentLengthInput');
const currentSegmentLength = document.getElementById('currentSegmentLength');
const periodInput = document.getElementById('periodInput');
const currentPeriod = document.getElementById('currentPeriod');
const stepInput = document.getElementById('stepInput');
const currentStep = document.getElementById('currentStep');
const backwardSpeed = document.getElementById('backwardSpeed');

// Smart scrub controls
const wordPlayer = document.getElementById('wordPlayer');
const keywordDisplay = document.getElementById('keywordDisplay');
const scrubStatus = document.getElementById('scrubStatus');
const fileInput = document.getElementById('audioFile');
const thresholdSlider = document.getElementById('thresholdSlider');
const thresholdLabel = document.getElementById('thresholdLabel');
const intervalSlider = document.getElementById('intervalSlider');
const intervalLabel = document.getElementById('intervalLabel');
const wordSpeedSlider = document.getElementById('wordSpeedSlider');
const wordSpeedLabel = document.getElementById('wordSpeedLabel');
const overlapSourcesSlider = document.getElementById('overlapSourcesSlider');
const overlapSourcesLabel = document.getElementById('overlapSourcesLabel');
const scrubStartSpeedSlider = document.getElementById('scrubStartSpeedSlider');
const scrubStartSpeedLabel = document.getElementById('scrubStartSpeedLabel');
const bwScrubStartSpeedSlider = document.getElementById('bwScrubStartSpeedSlider');
const bwScrubStartSpeedLabel = document.getElementById('bwScrubStartSpeedLabel');

let audioContext;
let audioSource;
let gainNode;
let isWebAudioConnected = false;

let speed = 1.0; // Default playbackspeed
const progress = document.getElementById('progress')
const progressContainer = document.getElementById('progress-container')
const currTime = document.querySelector('#currTime');
const durTime = document.querySelector('#durTime');

const songs = ['selectedpoems_01_furlong_64kb', 'selectedpoems_02_furlong_64kb', 'selectedpoems_03_furlong_64kb', 'round.mp3', 'manwhothinks'];


let songIndex = 4;

// Variable to track if we're in replay mode
let isReplayingSecond = false;
let replayTimeout;

// ===== BACKWARD PLAYBACK SYSTEM =====
// Backward parameters
let dynamicBackwardParams = {
    segmentDuration: 2.0,
    period: 1500,
    step: 1.5
};

// Function to get current backward parameters
function getBackwardParams() {
    return {
        segmentDuration: parseFloat(segmentLengthInput.value),
        period: parseInt(periodInput.value),
        step: parseFloat(stepInput.value)
    };
}

// Function to calculate backward speed
function calculateBackwardSpeed() {
    const params = getBackwardParams();
    return (params.step / (params.period / 1000)).toFixed(2);
}

// Function to update parameter displays
function updateParameterDisplays() {
    const params = getBackwardParams();
    currentSegmentLength.textContent = params.segmentDuration.toFixed(1);
    currentPeriod.textContent = params.period;
    currentStep.textContent = params.step.toFixed(1);
    backwardSpeed.textContent = calculateBackwardSpeed() + 'x';
    
    // Update dynamic parameters
    dynamicBackwardParams = params;
}

// Function to handle speed changes (positive and negative)
function handleSpeedChange(newSpeed) {
    speed = newSpeed;
    if (newSpeed === 0) {
        // Zero speed - pause playback
        console.log('Zero speed detected - pausing playback');

        // Exit backward mode if active
        if (backwardMode) {
            exitBackwardMode();
        }

        // Stop smart scrub if active
        if (smartScrubTimer !== null) {
            stopSmartScrub();
        }

        // Stop backward smart scrub if active
        if (backwardSmartScrubTimer !== null) {
            stopBackwardSmartScrub();
        }

        // Pause the audio
        audio.pause();
        manualPause = true;
        updatePlayButton();
        
    } else if (newSpeed < 0) {
        console.log('Negative speed detected:', newSpeed.toFixed(1), '- entering/updating backward mode');

        // Stop forward smart scrub if active
        if (smartScrubTimer !== null) {
            stopSmartScrub();
        }

        const absSpeed = Math.abs(newSpeed);

        // Check if backward smart scrub should activate (high negative speed + transcription available)
        if (absSpeed > bwScrubStartSpeed && informativeWords.length > 0) {
            // Exit regular backward mode if active
            if (backwardMode) {
                exitBackwardMode();
            }

            if (backwardSmartScrubTimer !== null) {
                // Already in backward smart scrub, recalc with new speed
                recalcInformativeForBackward(absSpeed);
                realignBwIndexTo(virtualPosition);
            } else {
                virtualPosition = audio.currentTime;
                startBackwardSmartScrub();
            }
            updateThresholdUIFromSpeed();
        } else {
            // Regular backward mode (speed below backward smart scrub threshold)
            if (backwardSmartScrubTimer !== null) {
                stopBackwardSmartScrub();
            }

            // Calculate backward period based on speed
            const backwardPeriod = Math.round((dynamicBackwardParams.step / absSpeed) * 1000);
            periodInput.value = backwardPeriod;
            updateParameterDisplays();

            // If buffer isn't loaded, kick off load early to avoid decode latency
            if (!audioBuffer && audioContext) {
                loadAudioBuffer().catch(console.error);
            }

            // If already in backward mode, just update the timer/period instead of exiting and re-entering.
            if (backwardMode) {
                // Parameters were already updated above, get the new period
                const newPeriod = dynamicBackwardParams.period;

                // Only restart the timer if the period has changed significantly (more than 10% difference)
                if (currentTimerPeriod !== null && newPeriod !== currentTimerPeriod) {
                    const periodChange = Math.abs((newPeriod - currentTimerPeriod) / currentTimerPeriod);

                    if (periodChange > 0.1) {
                        if (backwardTimer) {
                            clearInterval(backwardTimer);
                        }
                        currentTimerPeriod = newPeriod;
                        backwardTimer = setInterval(() => {
                            if (!backwardMode || manualPause) return;
                            virtualPosition = Math.max(0, virtualPosition - dynamicBackwardParams.step);
                            playBackwardSegment(virtualPosition);
                            updateProgressDisplay();
                        }, newPeriod);
                    }
                } else if (currentTimerPeriod === null || !backwardTimer) {
                    if (backwardTimer) {
                        clearInterval(backwardTimer);
                    }
                    currentTimerPeriod = newPeriod;
                    backwardTimer = setInterval(() => {
                        if (!backwardMode || manualPause) return;
                        virtualPosition = Math.max(0, virtualPosition - dynamicBackwardParams.step);
                        playBackwardSegment(virtualPosition);
                        updateProgressDisplay();
                    }, newPeriod);
                }
                return;
            }

            // Not currently in backward mode — enter it after a short debounce
            if (!backwardMode) {
                setTimeout(() => {
                    if (parseFloat(speedSlider.value) < 0) {
                        enterBackwardMode();
                        updatePlayButton();
                    }
                }, 150);
            }
        }
    } else {
        // Positive speed - normal forward playback or smart scrub
        console.log('Positive speed detected:', newSpeed.toFixed(1), '- using normal playback');

        // Exit backward mode if active
        if (backwardMode) {
            exitBackwardMode();
        }

        // Stop backward smart scrub if active
        if (backwardSmartScrubTimer !== null) {
            stopBackwardSmartScrub();
        }

        // Check if smart scrub should activate (high speed + transcription available)
        if (newSpeed > scrubStartSpeed && informativeWords.length > 0) {
            // Enter or stay in smart scrub mode
            if (smartScrubTimer !== null) {
                // Already in smart scrub, recalc with new speed
                smartScrubSpeedChangeTime = audio.currentTime;
                recalcInformative(false);
                realignNextIndexTo(smartScrubSpeedChangeTime);
            } else {
                recalcInformative(true);
                startSmartScrub();
            }
            updateThresholdUIFromSpeed();
        } else {
            // Normal forward playback (or speed below smart scrub threshold)
            if (smartScrubTimer !== null) {
                stopSmartScrub();
            }

            // Set normal playback rate
            audio.playbackRate = newSpeed;

            // If audio was paused due to zero speed, resume playing
            if (manualPause && audio.paused) {
                audio.play().catch(console.error);
                manualPause = false;
                updatePlayButton();
            }
        }
    }
}

// Backward playback state
let manualPause = false;
let backwardMode = false;
let virtualPosition = 0;

// Backward playback variables
let backwardTimer = null;
let currentTimerPeriod = null; // Track the period currently used by the timer
let lastSources = [];
let audioBuffer = null;

// Initialize Web Audio API and to bugfix github
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

// Play a segment of audio for backward mode
function playSegment(startTime, duration, playbackRate = 1.0) {
    if (!audioBuffer || !audioContext) {
        console.error('Cannot play segment: Audio buffer or context not ready');
        return null;
    }
    
    try {
        const source = audioContext.createBufferSource();
        const segmentGain = audioContext.createGain();

        source.buffer = audioBuffer;
        source.playbackRate.value = playbackRate;

        // Connect with its gain node so we can apply smooth crossfades
        source.connect(segmentGain);
        segmentGain.connect(audioContext.destination);

        const now = audioContext.currentTime;
        const fade = Math.min(0.03, duration / 6); // 30ms or smaller fraction

        // Audio rounding:Start with gain 0, ramp up quickly to avoid clicks, then ramp down before end
        segmentGain.gain.setValueAtTime(0, now);
        segmentGain.gain.linearRampToValueAtTime(1.0, now + fade);
        segmentGain.gain.setValueAtTime(1.0, now + duration - fade);
        segmentGain.gain.linearRampToValueAtTime(0, now + duration);

        // Start the source scheduled to play immediately (sample offset = startTime)
        source.start(now, startTime, duration);
        
        const segmentData = {
            source: source,
            gainNode: segmentGain,
            startTime: startTime,
            duration: duration
        };
        
        // Segment cleanup 
        source.onended = () => {
            console.log('Segment ended:', startTime.toFixed(2), 'to', (startTime + duration).toFixed(2));
            try {
                source.disconnect();
                segmentGain.disconnect();
            } catch (e) {}
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

// Play a backward segment at the right spot
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
    
    // Calculate segment boundaries using dynamic parameters
    const segmentEnd = Math.min(audioBuffer.duration, Math.max(0, endPosition));
    const segmentStart = Math.max(0, segmentEnd - dynamicBackwardParams.segmentDuration);
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
        console.log('Audio context not ready, attempting to resume');
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
        currentTimerPeriod = null;
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
    
    // Set up timer to play segments at regular intervals using dynamic parameters
    console.log('Setting up interval timer for segments every', dynamicBackwardParams.period, 'ms');
    currentTimerPeriod = dynamicBackwardParams.period;
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
        
        // Step backward for the next segment using dynamic step size
        virtualPosition = Math.max(0, virtualPosition - dynamicBackwardParams.step);
        
        console.log('Timer triggered: playing segment at position', virtualPosition.toFixed(2));
        playBackwardSegment(virtualPosition);
        
        // Update progress display
        updateProgressDisplay();
    }, dynamicBackwardParams.period);
    
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
    
    currentTimerPeriod = null;
    
    // Then stop all sources with proper cleanup
    lastSources = stopAllSources(lastSources);
    
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
    
    // Initialize Web Audio, just to make sure it's always there
    if (!audioContext) {
        const success = initWebAudio();
        if (!success) {
            console.error('Failed to initialize Web Audio API');
            return;
        }
    }
    
    // Ensure audio context is running
    await resumeAudioContext();
    
    // Load audio buffer, just to make sure it's always there
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
    
    // Update button states
    updateBackwardButton();
    updatePlayButton();
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
    
    // Update button states
    updateBackwardButton();
    updatePlayButton();
}

// Toggle backward mode
function toggleBackwardMode() {
    if (backwardMode) {
        exitBackwardMode();
        // Reset speed slider to positive value when exiting backward mode
        speedSlider.value = 1.0;
        currentSpeed.textContent = '1.0x';
        audio.playbackRate = 1.0;
    } else {
        // Set speed slider to a default negative value when entering backward mode
        speedSlider.value = -1.0;
        currentSpeed.textContent = '-1.0x';
        handleSpeedChange(-1.0);
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

// Update play/pause button appearance
function updatePlayButton() {
    if (!playBtn) return;

    // Check if in smart scrub mode (forward or backward)
    const inSmartScrubMode = (smartScrubTimer !== null || backwardSmartScrubTimer !== null);

    // Determine if playing based on mode
    let isPlaying;
    if (inSmartScrubMode) {
        // In smart scrub mode, playing if not paused
        isPlaying = !isSmartScrubPaused;
    } else {
        // Normal or backward mode
        isPlaying = (!audio.paused && !backwardMode) || (backwardMode && !manualPause);
    }

    if (isPlaying) {
        // Show pause button
        musicContainer.classList.add('play');
        playBtn.querySelector('i.fas').classList.remove('fa-play');
        playBtn.querySelector('i.fas').classList.add('fa-pause');
        playBtn.childNodes[0].textContent = 'Pause';
    } else {
        // Show play button
        musicContainer.classList.remove('play');
        playBtn.querySelector('i.fas').classList.add('fa-play');
        playBtn.querySelector('i.fas').classList.remove('fa-pause');
        playBtn.childNodes[0].textContent = 'Play';
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

// ===== SMART SCRUB SYSTEM =====
const API_KEY = "fae6aef01046408cb7e2c932adcf6e42";
const uploadUrl = "https://api.assemblyai.com/v2/upload";
const transcribeUrl = "https://api.assemblyai.com/v2/transcript";

const PRE_ROLL_SEC = 0.05;

// Word player pool for overlapping playback
let wordPlayerPoolSize = 2;
const wordPlayers = [];
const wordPlayerGainNodes = [];
const wordPlayerMediaSources = [];
let wordPlayerPoolIndex = 0;

// Smart scrub decoded buffer and Howler
let smartBuffer = null;
let smartSrc = null;
let smartGain = null;
let wordHowl = null;
let wordHowlUrl = null;
const MAX_OVERLAP_SOURCES = 3;
let activeWordHowlIds = [];

// Smart scrub state
let informativeWords = [];
let allTranscriptWords = [];
let smartScrubTimer = null;
let nextWordIndex = 0;
let isSmartScrubPaused = false;
let manualThresholdPercentile = null;
let hasUserAdjustedThreshold = false;
let userIntervalMs = 0;
let wordPlaybackSpeed = 1.0;
let scrubStartSpeed = 1.9;
let bwScrubStartSpeed = 1.9; // Threshold for backward smart scrub (absolute value)
let backwardSmartScrubTimer = null;
let bwNextWordIndex = 0;
let internalSeekGuard = false;
let smartScrubSpeedChangeTime = null;
const WORD_OVERLAP_MS = 100;

const commonWords = new Set([]);

// Set up word player
wordPlayer.volume = 1.0;
wordPlayer.muted = false;
wordPlayer.preservesPitch = true;
wordPlayer.mozPreservesPitch = true;
wordPlayer.webkitPreservesPitch = true;

function ensureWordPlayerPoolInitialized() {
    if (wordPlayers.length > 0) return;
    wordPlayers.push(wordPlayer);
}

function resizeWordPlayerPool(newSize) {
    const size = Math.max(1, Math.min(6, Math.floor(newSize || 1)));
    ensureWordPlayerPoolInitialized();

    while (wordPlayers.length < size) {
        const i = wordPlayers.length;
        const clone = wordPlayer.cloneNode();
        clone.id = `wordPlayer_${i}`;
        clone.style.display = 'none';
        clone.preservesPitch = true;
        clone.mozPreservesPitch = true;
        clone.webkitPreservesPitch = true;
        document.body.appendChild(clone);
        wordPlayers.push(clone);
    }

    while (wordPlayers.length > size) {
        const removed = wordPlayers.pop();
        const g = wordPlayerGainNodes.pop();
        const m = wordPlayerMediaSources.pop();
        try { if (m) m.disconnect(); } catch {}
        try { if (g) g.disconnect(); } catch {}
        try { removed.remove(); } catch {}
    }

    wordPlayerPoolSize = size;
    wordPlayerPoolIndex = wordPlayerPoolIndex % wordPlayerPoolSize;

    if (audioContext && wordPlayerGainNodes.length < wordPlayers.length) {
        for (let idx = wordPlayerGainNodes.length; idx < wordPlayers.length; idx++) {
            const p = wordPlayers[idx];
            const g = audioContext.createGain();
            const m = audioContext.createMediaElementSource(p);
            m.connect(g);
            g.connect(audioContext.destination);
            g.gain.value = 0;
            wordPlayerGainNodes[idx] = g;
            wordPlayerMediaSources[idx] = m;
        }
    }
}

function initWordPlayerPool() {
    if (!audioContext) return;
    ensureWordPlayerPoolInitialized();
    resizeWordPlayerPool(wordPlayerPoolSize);
}

async function decodeAudioFromBlob(blob) {
    try {
        const arrayBuffer = await blob.arrayBuffer();
        return await audioContext.decodeAudioData(arrayBuffer);
    } catch (e) {
        console.error('Failed to decode audio blob', e);
        return null;
    }
}

async function decodeAudioFromUrl(url) {
    try {
        const resp = await fetch(url);
        const blob = await resp.blob();
        return await decodeAudioFromBlob(blob);
    } catch (e) {
        console.error('Failed to decode from URL', url, e);
        return null;
    }
}

function stopSmartSegment(fadeMs = 10) {
    if (!smartSrc || !smartGain) return;
    const now = audioContext.currentTime;
    const fade = Math.max(0.005, (fadeMs || 10) / 1000);
    try {
        smartGain.gain.cancelScheduledValues(now);
        smartGain.gain.setValueAtTime(smartGain.gain.value, now);
        smartGain.gain.linearRampToValueAtTime(0, now + fade);
        setTimeout(() => {
            try { smartSrc.stop(); } catch {}
            try { smartSrc.disconnect(); } catch {}
            try { smartGain.disconnect(); } catch {}
            smartSrc = null;
            smartGain = null;
        }, fade * 1000 + 5);
    } catch {}
}

function playWordWithAudioElement(startSec, durationMs) {
    if (!audioContext || wordPlayerGainNodes.length === 0) {
        if (!audioContext) initWebAudio();
        initWordPlayerPool();
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
    }

    try {
        const idx = wordPlayerPoolIndex % wordPlayers.length;
        wordPlayerPoolIndex++;
        const player = wordPlayers[idx];
        const g = wordPlayerGainNodes[idx];

        const baseFadeMs = 240;
        const minFadeMs = 12;
        const fadeInMs = Math.max(minFadeMs, baseFadeMs / wordPlaybackSpeed);
        const fadeOutMs = Math.max(minFadeMs, baseFadeMs / wordPlaybackSpeed);
        const fadeIn = fadeInMs / 1000;
        const fadeOut = fadeOutMs / 1000;
        const now = audioContext.currentTime;

        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(0, now);
        player.preservesPitch = true;
        player.mozPreservesPitch = true;
        player.webkitPreservesPitch = true;
        player.playbackRate = wordPlaybackSpeed;

        const seekTarget = Math.max(0, startSec);
        player.pause();
        player.currentTime = seekTarget;

        const actualDurationMs = durationMs / wordPlaybackSpeed;
        const totalDurationMs = actualDurationMs + fadeInMs + fadeOutMs;

        const playPromise = player.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                const playNow = audioContext.currentTime;
                g.gain.cancelScheduledValues(playNow);
                g.gain.setValueAtTime(0, playNow);
                g.gain.linearRampToValueAtTime(1, playNow + fadeIn);
                const fadeStartTime = playNow + (actualDurationMs / 1000);
                g.gain.setValueAtTime(1, fadeStartTime);
                g.gain.linearRampToValueAtTime(0, fadeStartTime + fadeOut);
            }).catch(e => console.error('Failed to play word:', e));
        }

        if (player._wordTimeout) clearTimeout(player._wordTimeout);
        player._wordTimeout = setTimeout(() => {
            try {
                player.pause();
                g.gain.cancelScheduledValues(audioContext.currentTime);
                g.gain.setValueAtTime(0, audioContext.currentTime);
            } catch {}
            player._wordTimeout = null;
        }, totalDurationMs + 10);

        return true;
    } catch (e) {
        console.error('Error playing word with audio element:', e);
        return false;
    }
}

function playWordWithHowler(startSec, durationMs) {
    if (!wordHowl || wordHowl.state() !== 'loaded') return false;

    try {
        const baseFadeMs = 180;
        const fadeMs = baseFadeMs / wordPlaybackSpeed;
        const actualDurationMs = durationMs / wordPlaybackSpeed;
        const seekTarget = Math.max(0, startSec - PRE_ROLL_SEC);

        const id = wordHowl.play();
        activeWordHowlIds.push(id);

        if (activeWordHowlIds.length > MAX_OVERLAP_SOURCES) {
            const oldestId = activeWordHowlIds.shift();
            try {
                wordHowl.fade(wordHowl.volume(oldestId), 0, fadeMs, oldestId);
                setTimeout(() => { try { wordHowl.stop(oldestId); } catch {} }, fadeMs + 20);
            } catch {}
        }

        wordHowl.rate(wordPlaybackSpeed, id);
        wordHowl.volume(0, id);
        wordHowl.seek(seekTarget, id);
        wordHowl.fade(0, 1, fadeMs, id);

        setTimeout(() => {
            wordHowl.fade(1, 0, fadeMs, id);
        }, actualDurationMs);

        setTimeout(() => {
            try { wordHowl.stop(id); } catch {}
            activeWordHowlIds = activeWordHowlIds.filter(x => x !== id);
        }, actualDurationMs + fadeMs + 30);

        return true;
    } catch (e) {
        console.error('Howler playback error', e);
        return false;
    }
}

function playSmartSegment(startSec, durationMs) {
    if (!audioContext || !gainNode) return false;

    const now = audioContext.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(0, now + 0.01);

    const played = playWordWithHowler(startSec, durationMs);
    if (played) {
        const fadeMs = (180 / wordPlaybackSpeed);
        const actualDurationMs = durationMs / wordPlaybackSpeed;
        setTimeout(() => {
            const unmutNow = audioContext.currentTime;
            gainNode.gain.cancelScheduledValues(unmutNow);
            gainNode.gain.setValueAtTime(0, unmutNow);
            gainNode.gain.linearRampToValueAtTime(1, unmutNow + 0.01);
        }, actualDurationMs + fadeMs + 50);
        return true;
    }

    const fallbackPlayed = playWordWithAudioElement(startSec, durationMs);
    if (fallbackPlayed) {
        const fadeMs = (240 / wordPlaybackSpeed);
        const actualDurationMs = durationMs / wordPlaybackSpeed;
        setTimeout(() => {
            const unmutNow = audioContext.currentTime;
            gainNode.gain.cancelScheduledValues(unmutNow);
            gainNode.gain.setValueAtTime(0, unmutNow);
            gainNode.gain.linearRampToValueAtTime(1, unmutNow + 0.01);
        }, actualDurationMs + fadeMs + 50);
        return true;
    }

    const restoreNow = audioContext.currentTime;
    gainNode.gain.cancelScheduledValues(restoreNow);
    gainNode.gain.setValueAtTime(0, restoreNow);
    gainNode.gain.linearRampToValueAtTime(1, restoreNow + 0.01);
    return false;
}

// TF-IDF word scoring
function selectInformativeWordsTFIDF(words, speed = 1, overridePercentile = null, speedThreshold = null) {
    if (!Array.isArray(words) || words.length === 0) return [];

    const alpha = /[a-z]/i;
    const tokens = words.map(w => ({
        text: (w.text || '').toLowerCase().replace(/[^a-z'\-]/gi, ''),
        start: w.start,
        end: w.end
    })).filter(w => {
        if (!w.text || !alpha.test(w.text) || commonWords.has(w.text)) return false;
        return true;
    });

    if (tokens.length === 0) return [];

    const wordFreq = new Map();
    for (const t of tokens) {
        wordFreq.set(t.text, (wordFreq.get(t.text) || 0) + 1);
    }

    const wordScores = new Map();
    for (const [word, freq] of wordFreq.entries()) {
        const length = word.length;
        const rarity = 1 / freq;
        const score = (length * length) * rarity;
        wordScores.set(word, score);
    }

    const scores = Array.from(wordScores.values()).filter(v => isFinite(v) && v > 0);
    if (scores.length === 0) return tokens;
    scores.sort((a, b) => a - b);

    let p = Math.min(0.95, 0.50 + (speed - (speedThreshold !== null ? speedThreshold : scrubStartSpeed)) * 0.125);
    if (overridePercentile !== null && overridePercentile >= 0.60 && overridePercentile <= 0.95) {
        p = overridePercentile;
    }
    const idx = Math.floor(p * (scores.length - 1));
    const threshold = scores[idx];

    const informative = tokens
        .map(t => ({ ...t, score: wordScores.get(t.text) || 0 }))
        .filter(t => t.score >= threshold)
        .sort((a, b) => a.start - b.start);

    return informative.map(({ text, start, end }) => ({ text, start, end }));
}

function recalcInformative(resetIndexToCurrent = true) {
    if (allTranscriptWords.length === 0) return;
    informativeWords = selectInformativeWordsTFIDF(
        allTranscriptWords,
        speed,
        hasUserAdjustedThreshold ? manualThresholdPercentile : null
    );
    if (resetIndexToCurrent) {
        realignNextIndexTo(audio.currentTime);
    }
}

function realignNextIndexTo(timeSec) {
    nextWordIndex = 0;
    while (nextWordIndex < informativeWords.length && informativeWords[nextWordIndex].start <= timeSec) {
        nextWordIndex++;
    }
}

function updateThresholdUIFromSpeed() {
    const absSpeed = Math.abs(speed);
    const threshold = speed >= 0 ? scrubStartSpeed : bwScrubStartSpeed;
    const dynamicP = Math.min(0.95, 0.50 + (absSpeed - threshold) * 0.125);
    thresholdSlider.value = Math.round(dynamicP * 100);
    thresholdLabel.textContent = `${Math.round(dynamicP * 100)}th percentile`;
}

// AssemblyAI upload and transcription
async function uploadToAssembly(file) {
    const resp = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Authorization": API_KEY },
        body: file
    });
    const data = await resp.json();
    return data.upload_url;
}

async function getTranscript(audioUrl) {
    const resp = await fetch(transcribeUrl, {
        method: "POST",
        headers: { "Authorization": API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
            audio_url: audioUrl,
            speaker_labels: false,
            punctuate: true,
            format_text: true,
            word_boost: [],
            boost_param: "default",
            disfluencies: false
        })
    });
    const job = await resp.json();

    let statusCheck;
    do {
        await new Promise(r => setTimeout(r, 5000));
        const poll = await fetch(`${transcribeUrl}/${job.id}`, {
            headers: { "Authorization": API_KEY }
        });
        statusCheck = await poll.json();
        if (statusCheck.status === "error" || statusCheck.status === "failed") {
            throw new Error(statusCheck.error || "Transcription failed");
        }
    } while (statusCheck.status !== "completed");

    return statusCheck.words.map(w => ({ text: w.text, start: w.start / 1000, end: w.end ? w.end / 1000 : undefined }));
}

// Load and process audio for smart scrub
async function loadAndProcessAudioForScrub(blob) {
    try {
        if (!audioContext) initWebAudio();

        smartBuffer = await decodeAudioFromBlob(blob);

        // Rebuild Howler instance
        try {
            if (wordHowl) {
                wordHowl.unload();
                wordHowl = null;
            }
            if (wordHowlUrl) {
                URL.revokeObjectURL(wordHowlUrl);
                wordHowlUrl = null;
            }
            wordHowlUrl = URL.createObjectURL(blob);
            wordHowl = new Howl({
                src: [wordHowlUrl],
                html5: false,
                preload: true,
                onloaderror: (id, err) => console.error('Howler load error', err),
                onplayerror: (id, err) => console.error('Howler play error', err)
            });
            ensureWordPlayerPoolInitialized();
            resizeWordPlayerPool(wordPlayerPoolSize);
            wordPlayers.forEach(p => { p.src = wordHowlUrl; });
        } catch (e) {
            console.error('Failed to init Howler for word playback', e);
        }

        scrubStatus.textContent = "Uploading audio...";
        const audioUploadUrl = await uploadToAssembly(blob);

        scrubStatus.textContent = "Processing transcription...";
        const words = await getTranscript(audioUploadUrl);

        // Filter unrealistically short words
        const cleanedWords = words.filter(w => {
            if (typeof w.end === 'number' && w.end > w.start) {
                const durationMs = (w.end - w.start) * 1000;
                const wordLength = (w.text || '').replace(/[^a-z'\-]/gi, '').length;
                const minDurationMs = 150 + (wordLength * 15);
                if (durationMs < minDurationMs) return false;
            }
            return true;
        });

        allTranscriptWords = cleanedWords;
        informativeWords = selectInformativeWordsTFIDF(words, speed);
        nextWordIndex = 0;
        scrubStatus.textContent = "Transcription ready. Smart scrub available at high speeds.";
        console.log("Informative words:", informativeWords);
    } catch (error) {
        console.error("Error processing audio:", error);
        scrubStatus.textContent = "Error processing audio. Please try again.";
    }
}

// Smart scrub start/stop
function startSmartScrub() {
    audio.pause();
    audio.playbackRate = 1.0;

    if (!audioContext) initWebAudio();
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
    }
    initWordPlayerPool();

    isSmartScrubPaused = false;

    const getIntervalMs = () => {
        if (userIntervalMs !== null) return userIntervalMs;
        return Math.max(0, 700 / Math.max(0.1, speed - 1.5));
    };

    const getOverlapMs = () => {
        const intervalMs = getIntervalMs();
        return Math.max(0, WORD_OVERLAP_MS * (1 - intervalMs / 500));
    };

    let lastPlayTime = Date.now();

    smartScrubTimer = setInterval(() => {
        if (speed <= scrubStartSpeed) return stopSmartScrub({ resumeAudio: true });
        if (isSmartScrubPaused) return;

        const now = Date.now();
        const gapMs = getIntervalMs();
        const overlapMs = getOverlapMs();
        const effectiveWaitMs = Math.max(0, gapMs - overlapMs);
        if (now - lastPlayTime < effectiveWaitMs) return;

        if (nextWordIndex >= informativeWords.length) return stopSmartScrub({ resumeAudio: true });
        const next = informativeWords[nextWordIndex];

        let wordDurationMs;
        if (typeof next.end === 'number' && next.end > next.start) {
            wordDurationMs = (next.end - next.start) * 1000;
        } else {
            wordDurationMs = 250;
        }

        keywordDisplay.textContent = next.text;

        if (!smartBuffer && audio.src) {
            decodeAudioFromUrl(audio.src).then(buf => { smartBuffer = buf; });
            return;
        }

        try {
            internalSeekGuard = true;
            audio.currentTime = Math.max(0, next.start - PRE_ROLL_SEC);
        } catch {
            internalSeekGuard = false;
        }

        playSmartSegment(next.start, wordDurationMs);
        nextWordIndex++;
        lastPlayTime = now + wordDurationMs + gapMs - overlapMs;
    }, 50);

    updatePlayButton();
}

function stopSmartScrub(options = {}) {
    const { resumeAudio = false } = options;
    clearInterval(smartScrubTimer);
    smartScrubTimer = null;
    keywordDisplay.textContent = "";
    isSmartScrubPaused = false;
    stopSmartSegment(8);
    if (audioContext && gainNode) {
        gainNode.gain.cancelScheduledValues(audioContext.currentTime);
        gainNode.gain.setValueAtTime(gainNode.gain.value, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(1, audioContext.currentTime + 0.01);
    }
    audio.playbackRate = Math.max(0.5, Math.min(4, parseFloat(speedSlider.value) || 1));
    if (resumeAudio && audio.paused) {
        audio.play().catch(() => {});
    }
    updatePlayButton();
}

// Smart scrub parameter slider handlers
thresholdSlider.oninput = () => {
    const val = parseInt(thresholdSlider.value, 10);
    manualThresholdPercentile = val / 100;
    thresholdLabel.textContent = `${val}th percentile`;
    hasUserAdjustedThreshold = true;
    recalcInformative(false);
};

intervalSlider.oninput = () => {
    const val = parseInt(intervalSlider.value, 10);
    userIntervalMs = val;
    intervalLabel.textContent = `${val}ms`;
};

wordSpeedSlider.oninput = () => {
    const val = parseFloat(wordSpeedSlider.value);
    wordPlaybackSpeed = val;
    wordSpeedLabel.textContent = `${val.toFixed(1)}x`;
};

overlapSourcesSlider.oninput = () => {
    const val = Math.round(parseInt(overlapSourcesSlider.value, 10) || 1);
    overlapSourcesLabel.textContent = `${val}`;
    wordPlayerPoolSize = val;
    resizeWordPlayerPool(wordPlayerPoolSize);
    if (wordHowlUrl) {
        wordPlayers.forEach(p => { p.src = wordHowlUrl; });
    }
};

scrubStartSpeedSlider.oninput = () => {
    const val = parseFloat(scrubStartSpeedSlider.value);
    scrubStartSpeed = val - 0.1;
    scrubStartSpeedLabel.textContent = `${val.toFixed(1)}x`;

    if (speed > scrubStartSpeed && smartScrubTimer === null && informativeWords.length > 0) {
        recalcInformative(true);
        startSmartScrub();
    } else if (speed <= scrubStartSpeed && smartScrubTimer !== null) {
        stopSmartScrub({ resumeAudio: true });
        audio.playbackRate = speed;
    }
};

// ===== BACKWARD SMART SCRUB =====
// Recalc informative words for backward scrub (uses absolute speed value)
function recalcInformativeForBackward(absSpeed) {
    if (allTranscriptWords.length === 0) return;
    informativeWords = selectInformativeWordsTFIDF(
        allTranscriptWords,
        absSpeed,
        hasUserAdjustedThreshold ? manualThresholdPercentile : null,
        bwScrubStartSpeed
    );
}

function realignBwIndexTo(timeSec) {
    // Find the last informative word at or before timeSec
    bwNextWordIndex = informativeWords.length - 1;
    while (bwNextWordIndex >= 0 && informativeWords[bwNextWordIndex].start > timeSec) {
        bwNextWordIndex--;
    }
}

function startBackwardSmartScrub() {
    // Stop regular backward mode if it's running
    if (backwardMode) {
        stopBackwardMode();
        backwardMode = false;
        audio.muted = false;
    }

    audio.pause();
    audio.playbackRate = 1.0;

    if (!audioContext) initWebAudio();
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
    }
    initWordPlayerPool();

    isSmartScrubPaused = false;

    // Recalc informative words using absolute speed
    const absSpeed = Math.abs(speed);
    recalcInformativeForBackward(absSpeed);
    realignBwIndexTo(virtualPosition);

    const getIntervalMs = () => {
        if (userIntervalMs !== null) return userIntervalMs;
        return Math.max(0, 700 / Math.max(0.1, Math.abs(speed) - 1.5));
    };

    const getOverlapMs = () => {
        const intervalMs = getIntervalMs();
        return Math.max(0, WORD_OVERLAP_MS * (1 - intervalMs / 500));
    };

    let lastPlayTime = Date.now();

    backwardSmartScrubTimer = setInterval(() => {
        const absSpd = Math.abs(speed);
        if (absSpd <= bwScrubStartSpeed) return stopBackwardSmartScrub();
        if (isSmartScrubPaused) return;

        const now = Date.now();
        const gapMs = getIntervalMs();
        const overlapMs = getOverlapMs();
        const effectiveWaitMs = Math.max(0, gapMs - overlapMs);
        if (now - lastPlayTime < effectiveWaitMs) return;

        if (bwNextWordIndex < 0) return stopBackwardSmartScrub();
        const next = informativeWords[bwNextWordIndex];

        let wordDurationMs;
        if (typeof next.end === 'number' && next.end > next.start) {
            wordDurationMs = (next.end - next.start) * 1000;
        } else {
            wordDurationMs = 250;
        }

        keywordDisplay.textContent = next.text;

        if (!smartBuffer && audio.src) {
            decodeAudioFromUrl(audio.src).then(buf => { smartBuffer = buf; });
            return;
        }

        // Update virtual position to this word
        virtualPosition = next.start;
        try {
            internalSeekGuard = true;
            audio.currentTime = Math.max(0, next.start - PRE_ROLL_SEC);
        } catch {
            internalSeekGuard = false;
        }

        // Update progress display
        updateProgressDisplay();

        playSmartSegment(next.start, wordDurationMs);
        bwNextWordIndex--; // Step backward through word list
        lastPlayTime = now + wordDurationMs + gapMs - overlapMs;
    }, 50);

    updatePlayButton();
}

function stopBackwardSmartScrub() {
    clearInterval(backwardSmartScrubTimer);
    backwardSmartScrubTimer = null;
    keywordDisplay.textContent = "";
    isSmartScrubPaused = false;
    stopSmartSegment(8);
    if (audioContext && gainNode) {
        gainNode.gain.cancelScheduledValues(audioContext.currentTime);
        gainNode.gain.setValueAtTime(gainNode.gain.value, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(1, audioContext.currentTime + 0.01);
    }
    audio.muted = false;
    updatePlayButton();
}

// Backward smart scrub start speed slider handler
bwScrubStartSpeedSlider.oninput = () => {
    const val = parseFloat(bwScrubStartSpeedSlider.value);
    bwScrubStartSpeed = val - 0.1;
    bwScrubStartSpeedLabel.textContent = `-${val.toFixed(1)}x`;

    const absSpeed = Math.abs(speed);
    if (speed < 0 && absSpeed > bwScrubStartSpeed && backwardSmartScrubTimer === null && informativeWords.length > 0) {
        virtualPosition = audio.currentTime;
        startBackwardSmartScrub();
    } else if (speed < 0 && absSpeed <= bwScrubStartSpeed && backwardSmartScrubTimer !== null) {
        stopBackwardSmartScrub();
        // Fall back to regular backward mode
        handleSpeedChange(speed);
    }
};
// ===== END BACKWARD SMART SCRUB =====

// Realign smart scrub on user seek
audio.addEventListener('seeked', () => {
    if (internalSeekGuard) { internalSeekGuard = false; return; }

    const t = audio.currentTime;

    // Handle forward smart scrub seek
    if (smartScrubTimer !== null) {
        stopSmartSegment(8);
        smartScrubSpeedChangeTime = t;
        recalcInformative(false);
        realignNextIndexTo(smartScrubSpeedChangeTime);
        return;
    }

    // Handle backward smart scrub seek
    if (backwardSmartScrubTimer !== null) {
        stopSmartSegment(8);
        virtualPosition = t;
        recalcInformativeForBackward(Math.abs(speed));
        realignBwIndexTo(t);
        return;
    }

    if (speed > scrubStartSpeed && informativeWords.length > 0) {
        recalcInformative(false);
        realignNextIndexTo(t);
        startSmartScrub();
    }

    if (speed < 0 && Math.abs(speed) > bwScrubStartSpeed && informativeWords.length > 0) {
        virtualPosition = t;
        recalcInformativeForBackward(Math.abs(speed));
        realignBwIndexTo(t);
        startBackwardSmartScrub();
    }
});

// File upload handler for smart scrub transcription
fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;

    // Stop any active modes
    if (backwardMode) exitBackwardMode();
    if (smartScrubTimer !== null) stopSmartScrub();
    if (backwardSmartScrubTimer !== null) stopBackwardSmartScrub();

    // Reset buffers
    audioBuffer = null;
    smartBuffer = null;
    allTranscriptWords = [];
    informativeWords = [];

    const objectUrl = URL.createObjectURL(file);
    audio.src = objectUrl;
    wordPlayer.src = objectUrl;

    await loadAndProcessAudioForScrub(file);
};

// Auto-load default audio transcription on startup
window.addEventListener('load', async () => {
    try {
        scrubStatus.textContent = "Loading default audio for transcription...";
        const response = await fetch(audio.src);
        const blob = await response.blob();
        await loadAndProcessAudioForScrub(blob);
    } catch (error) {
        console.error("Error loading default file for transcription:", error);
        scrubStatus.textContent = "Upload a file to enable smart scrub.";
    }
});
// ===== END SMART SCRUB SYSTEM =====

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

    // Stop smart scrub if active
            if (smartScrubTimer !== null) {
                stopSmartScrub({ resumeAudio: true });
    }

    // Stop backward smart scrub if active
    if (backwardSmartScrubTimer !== null) {
        stopBackwardSmartScrub();
    }

    // Clear audio buffer when loading new song
    audioBuffer = null;
    smartBuffer = null;
    allTranscriptWords = [];
    informativeWords = [];

    audio.src = `mp3s/${song}.mp3`;
    wordPlayer.src = `mp3s/${song}.mp3`;

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
    
    manualPause = false;
    
    try {
        await audio.play();
        updatePlayButton();
    } catch (error) {
        console.error('Failed to play audio:', error);
    }
}

function pauseSong() {
    manualPause = true;
    
    // Pause backward playback if active
    if (backwardMode) {
        // The segments will auto-stop due to manualPause flag
        console.log('Pausing backward playback');
    }
    
    audio.pause();
    updatePlayButton();
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
    const width = this.clientWidth;
    const clickX = e.offsetX;
    const duration = audio.duration;
    const newTime = (clickX / width) * duration;
    
    // Update position
    audio.currentTime = newTime;
    virtualPosition = newTime;
    
    // Check if speed is negative (backward mode)
    const currentSpeed = parseFloat(speedSlider.value);
    
    if (currentSpeed < 0) {
        // Speed is negative - enter backward mode
        console.log('Progress bar clicked with negative speed, entering backward mode');
        
        // Exit backward mode if already active, then enter with new position
        if (backwardMode) {
            exitBackwardMode();
        }
        
        // Update the period based on current speed and enter backward mode
        const backwardPeriod = Math.round((dynamicBackwardParams.step / Math.abs(currentSpeed)) * 1000);
        periodInput.value = backwardPeriod;
        updateParameterDisplays();
        
        // Enter backward mode with the new position
        setTimeout(() => {
            enterBackwardMode();
        }, 100);
        
    } else {
        // Speed is positive - normal forward playback
        if (backwardMode) {
            exitBackwardMode();
        }
        
        // Automatically start playing when clicking progress bar
        if (audio.paused) {
            playSong();
        }
    }
}

//get duration & currentTime for Time of song
function DurTime (e) {
    if (backwardMode) {
        // time display is separate from backward mode
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

    // display immediately for smooth UI feedback
    currentSpeed.textContent = `${newSpeed.toFixed(1)}x`;
    speed = newSpeed;

    // Update threshold UI to reflect speed change
    if (newSpeed > scrubStartSpeed || (newSpeed < 0 && Math.abs(newSpeed) > bwScrubStartSpeed)) {
        updateThresholdUIFromSpeed();
    }

    // Clear previous timeout
    clearTimeout(speedTimeout);

    // Set new timeout to update playback rate after user stops dragging
    speedTimeout = setTimeout(() => {
        handleSpeedChange(newSpeed);
    }, 100); // 100ms delay
});

// Also handle when user releases the slider (for immediate response)
speedSlider.addEventListener('change', () => {
    clearTimeout(speedTimeout);
    const newSpeed = parseFloat(speedSlider.value);
    speed = newSpeed;
    handleSpeedChange(newSpeed);
    currentSpeed.textContent = `${newSpeed.toFixed(1)}x`;
});

// Handle max sources input changes
maxSourcesInput.addEventListener('input', () => {
    const newMaxSources = parseInt(maxSourcesInput.value);
    currentMaxSources.textContent = newMaxSources;
    
    // If in backward mode and have too many sources, clean up immediately
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

// Handle backward parameter changes
segmentLengthInput.addEventListener('input', updateParameterDisplays);
periodInput.addEventListener('input', updateParameterDisplays);
stepInput.addEventListener('input', updateParameterDisplays);

// Initialize parameter displays
updateParameterDisplays();

// Event listeners for play button
playBtn.addEventListener('click', () => {
  // Check if in smart scrub mode (forward or backward)
  const inSmartScrubMode = (smartScrubTimer !== null || backwardSmartScrubTimer !== null);

  if (inSmartScrubMode) {
    // Handle smart scrub pause/resume
    if (isSmartScrubPaused) {
      // Resume smart scrub
      isSmartScrubPaused = false;
    } else {
      // Pause smart scrub
      isSmartScrubPaused = true;
      audio.pause();
      stopSmartSegment(8);
      if (audioContext && gainNode) {
        gainNode.gain.cancelScheduledValues(audioContext.currentTime);
        gainNode.gain.setValueAtTime(gainNode.gain.value, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(1, audioContext.currentTime + 0.01);
      }
    }
    updatePlayButton();
    return;
  }

  // Normal play/pause logic (not in smart scrub mode)
  const currentSpeedVal = parseFloat(speedSlider.value);
  const isPlaying = (!audio.paused && !backwardMode) || (backwardMode && !manualPause);

  if (isPlaying) {
    // If currently playing in either mode, pause
    pauseSong();
    return;
  }

  if (currentSpeedVal < 0) {
    // Negative speed: play in backward mode
    if (!backwardMode) {
      enterBackwardMode();
    } else {
      manualPause = false;
    }
    updatePlayButton();
  } else if (currentSpeedVal === 0) {
    // Zero speed: remain paused
    pauseSong();
  } else {
    // Positive speed: normal forward play
    playSong();
  }
});

// replay last second button
replaySecondBtn.addEventListener('click', replayLastSecond);

// 1x backward button
backwardBtn.addEventListener('click', toggleBackwardMode);


// time/song update
audio.addEventListener('timeupdate', updateProgress);

// Click on progress bar
progressContainer.addEventListener('click', setProgress);

audio.addEventListener('ended', () => {
    pauseSong();
    // Exit backward mode if active
    if (backwardMode) {
        exitBackwardMode();
    }
    updatePlayButton();
});

// Time of song
audio.addEventListener('timeupdate', DurTime);

// Handles initial user interaction
function handleFirstInteraction() {
    if (!audioContext) {
        initWebAudio();
    }
    // remove event listeners after first interaction
    document.removeEventListener('click', handleFirstInteraction);
    document.removeEventListener('keydown', handleFirstInteraction);
}

// event listeners for first user interaction
document.addEventListener('click', handleFirstInteraction);
document.addEventListener('keydown', handleFirstInteraction);
