const musicContainer = document.getElementById('music-container')
const playBtn = document.getElementById('play')

const audio = document.getElementById('audio')
const speedSlider = document.getElementById('speedSlider');
const currentSpeed = document.getElementById('currentSpeed');

let speed = 1.0; // Default speed
const progress = document.getElementById('progress')
const progressContainer = document.getElementById('progress-container')
const currTime = document.querySelector('#currTime');
const durTime = document.querySelector('#durTime');

const songs = ['selectedpoems_01_furlong_64kb', 'selectedpoems_02_furlong_64kb', 'selectedpoems_03_furlong_64kb'];


// Keep track of song
let songIndex = 2;

// Initially load song details into DOM
loadSong(songs[songIndex]);

function loadSong(song) {
  audio.src = `mp3s/${song}.mp3`;
}

function playSong() {
  musicContainer.classList.add('play');
  playBtn.querySelector('i.fas').classList.remove('fa-play');
  playBtn.querySelector('i.fas').classList.add('fa-pause');

  audio.play();
}

function pauseSong() {
  musicContainer.classList.remove('play');
  playBtn.querySelector('i.fas').classList.add('fa-play');
  playBtn.querySelector('i.fas').classList.remove('fa-pause');

  audio.pause();
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

// Add event listener for slider changes
speedSlider.addEventListener('input', () => {
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

audio.playbackRate = speed;

// Time/song update
audio.addEventListener('timeupdate', updateProgress);

// Click on progress bar
progressContainer.addEventListener('click', setProgress);


// Time of song
audio.addEventListener('timeupdate',DurTime);