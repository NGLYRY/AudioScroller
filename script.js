console.log("script.js works hooray!");

const musicContainer = document.getElementById('music-container')
const playBtn = document.getElementById('play')
const replaySecondBtn = document.getElementById('replaySecond')

const audio = document.getElementById('audio')
const speedSlider = document.getElementById('speedSlider');
const currentSpeed = document.getElementById('currentSpeed');

let audioContext;
let audioSource;
let gainNode;
let isWebAudioConnected = false;

let speed = 1.0; // Default speed
const progress = document.getElementById('progress')
const progressContainer = document.getElementById('progress-container')
const currTime = document.querySelector('#currTime');
const durTime = document.querySelector('#durTime');

const songs = ['selectedpoems_01_furlong_64kb', 'selectedpoems_02_furlong_64kb', 'selectedpoems_03_furlong_64kb'];


// Keep track of song
let songIndex = 2;

// Variable to track if we're in replay mode
let isReplayingSecond = false;
let replayTimeout;

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
  audio.src = `mp3s/${song}.mp3`;
}

async function playSong() {
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

  // Change button text
  playBtn.childNodes[0].textContent = 'Play';

  audio.pause();
}


function replayLastSecond() {
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
  const { duration, currentTime } = e.srcElement;
  const progressPercent = (currentTime / duration) * 100;
  progress.style.width = `${progressPercent}%`;
}

function setProgress(e) {
  const width = this.clientWidth;
  const clickX = e.offsetX;
  const duration = audio.duration;
  audio.currentTime = (clickX / width) * duration;
}

//get duration & currentTime for Time of song
function DurTime (e) {
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

audio.playbackRate = parseFloat(speedSlider.value);
currentSpeed.textContent = `${speedSlider.value}x`;

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

// audio.playbackRate = speed;

// Time/song update
audio.addEventListener('timeupdate', updateProgress);

// Click on progress bar
progressContainer.addEventListener('click', setProgress);

audio.addEventListener('ended', pauseSong);

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

