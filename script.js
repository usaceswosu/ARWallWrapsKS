/* =====================================================================
   KEYSTONE LAKE AR MAP — script.js

   How the app flows:
     1. The user taps "Start" → the camera turns on and MindAR starts
        looking for the printed map.
     2. When the camera gets close to one of the marked areas on the
        map, MindAR recognizes that smaller image ("sub-target") and
        fires a "targetFound" event.
     3. We respond by opening a menu for that area: either a picker
        (if the marker covers several locations) or the action menu.
     4. From the action menu the user can view 360° photos, watch a
        video, or open a website. Coming back resumes AR tracking.
   ===================================================================== */


/* =====================================================================
   LOCATION DATA
   Each location has:
     name      → text shown in menus and the panorama bar
     panoramas → list of 360° image paths (1 = no arrows, 2+ = arrows)
     video     → path to an mp4 file, or null if there isn't one
     website   → a URL, or null if there isn't one
   To add a photo, just add another filename to that location's list.
   ===================================================================== */
const LOCATIONS = {

    feyodiCreek: {
        name: "Feyodi Creek",
        panoramas: ["assets/Feyodi_Creek_Rec_Area.JPG"],
        video: null,
        website: null
    },

    cowskinBay: {
        name: "Cowskin Bay",
        panoramas: ["assets/Cowskin_Bay_North.JPG"],
        video: null,
        website: null
    },

    walnutCreek: {
        name: "Walnut Creek",
        panoramas: [
            "assets/Walnut Creek Boat Ramp.JPG",
            "assets/Walnut Creek Campground 1.JPG",
            "assets/Walnut Creek Shelter.JPG"
        ],
        video: null,
        website: "https://www.recreation.gov/camping/campgrounds/10041510?tab=campsites"
    },

    appalachiaBay: {
        name: "Appalachia Bay",
        panoramas: ["assets/Appalacia_Bay_Parking_Picnic.JPG"],
        video: "assets/Appalacia Bay Park.mp4",
        website: "https://www.recreation.gov/camping/campgrounds/10309470"
    },

    washingtonIrving: {
        name: "Washington Irving",
        panoramas: ["assets/Washington_Irving_South_Campground.JPG"],
        video: "assets/Washington Irving Park.mp4",
        website: "https://www.recreation.gov/camping/campgrounds/233667"
    },

    newMannford: {
        name: "New Mannford",
        panoramas: [
            "assets/New_Mannford_Boat_Ramp.JPG",
            "assets/New_Mannford_Ramp_Crosstimbers.JPG"
        ],
        video: null,
        website: null
    },

    keystoneStatePark: {
        name: "Keystone State Park",
        panoramas: [
            "assets/Keystone_Overlook_Dam.JPG",
            "assets/Keystone_State_Park.JPG",
            "assets/Keystone_State_Park_Gen_Store.JPG"
        ],
        video: null,
        website: null
    },

    whiteWaterBay: {
        name: "White Water Bay",
        panoramas: ["assets/White_Water.JPG"],
        video: null,
        website: null
    },

    brushCreek: {
        name: "Brush Creek",
        panoramas: ["assets/Brush_Creek_Rec_Area_Volleyball.JPG"],
        video: "assets/Brush Creek Park.mp4",
        website: "https://www.recreation.gov/camping/campgrounds/10040524"
    }

};


/* =====================================================================
   SUB-TARGET DATA
   One entry per close-up target in the .mind file, in the same order
   (entry 0 here = targetIndex 1 in the HTML, entry 1 = targetIndex 2...).
     type "single" → goes straight to that location's action menu
     type "nested" → shows a picker first, listing several locations
   markerPos is kept for reference; nothing in the code reads it yet.
   ===================================================================== */
const SUB_TARGETS = [
    {
        type: "single",
        location: "feyodiCreek",
        markerPos: "-0.35 0.30 0.03"
    },
    {
        type: "single",
        location: "cowskinBay",
        markerPos: "-0.18 0.18 0.03"
    },
    {
        type: "single",
        location: "walnutCreek",
        markerPos: "0.35 0.30 0.03"
    },
    {
        type: "nested",
        pickerTitle: "Keystone Lake",
        locations: ["appalachiaBay", "washingtonIrving"],
        markerPos: "0.15 0.05 0.03"
    },
    {
        type: "single",
        location: "newMannford",
        markerPos: "0.00 -0.25 0.03"
    },
    {
        type: "nested",
        pickerTitle: "Keystone Lake South",
        locations: ["keystoneStatePark", "whiteWaterBay", "brushCreek"],
        markerPos: "0.35 -0.25 0.03"
    }
];


/* =====================================================================
   TIMING SETTINGS (milliseconds)
   ===================================================================== */
const SCENE_LOAD_TIMEOUT = 15000;   // give up starting AR after 15 seconds
const RESIZE_DELAY = 200;           // wait before nudging AR after returning
const START_RESIZE_DELAY = 100;     // wait before nudging AR after first start
const MENU_COOLDOWN = 4000;         // wait before a closed menu can re-open
const WEBSITE_COOLDOWN = 3000;      // wait before menus re-open after a website


/* =====================================================================
   ELEMENT REFERENCES
   Grab every element we need from the page once, up front.
   ===================================================================== */

// Start screen
const overlay = document.querySelector('#overlay');
const startButton = document.querySelector('#startButton');
const loadingMsg = document.querySelector('#loadingMsg');
const errorMsg = document.querySelector('#errorMsg');

// The main AR scene
const arScene = document.querySelector('#arScene');

// Location picker menu
const pickerOverlay = document.querySelector('#pickerOverlay');
const pickerTitle = document.querySelector('#pickerTitle');
const pickerBtns = document.querySelector('#pickerBtns');
const pickerBack = document.querySelector('#pickerBack');

// Action menu
const actionOverlay = document.querySelector('#actionOverlay');
const actionTitle = document.querySelector('#actionTitle');
const actionBtns = document.querySelector('#actionBtns');
const actionBack = document.querySelector('#actionBack');

// 360° panorama view
const panoramaContainer = document.querySelector('#panoramaContainer');
const panoramaSky = document.querySelector('#panoramaSky');
const panoLabel = document.querySelector('#panoLabel');
const panoCounter = document.querySelector('#panoCounter');
const prevPanoBtn = document.querySelector('#prevPano');
const nextPanoBtn = document.querySelector('#nextPano');
const exitPanoramaBtn = document.querySelector('#exitPanorama');

// Video view
const videoContainer = document.querySelector('#videoContainer');
const locationVideo = document.querySelector('#locationVideo');
const exitVideoBtn = document.querySelector('#exitVideo');


/* =====================================================================
   STATE
   Variables that change while the app runs.
   ===================================================================== */

// One true/false flag per sub-target. true = its menu already opened,
// so we don't keep re-opening it every frame while the camera sees it.
const triggered = new Array(SUB_TARGETS.length).fill(false);

// Which panorama photos are open, and which one is on screen
let currentPanoList = [];
let currentPanoIndex = 0;
let currentPanoName = "";

// Whether the action menu was reached through the picker
// (decides what its Back button does)
let actionCameFromPicker = false;

// The sub-target config that opened the picker, so Back can re-open it
let activePicker = null;


/* =====================================================================
   SMALL HELPERS
   ===================================================================== */

// Returns MindAR's controller, which can start and stop the camera tracking
function getMindARSystem() {
    return arScene.systems["mindar-image-system"];
}

// Allows every sub-target to open its menu again
function resetTriggers() {
    triggered.fill(false);
}

// Waits `delay` ms, then allows every sub-target to open its menu again
function resetTriggersAfter(delay) {
    setTimeout(resetTriggers, delay);
}

// Tells A-Frame/MindAR the window "resized" so they recalculate the
// camera feed size (needed after the AR scene was hidden and shown again)
function triggerResize() {
    const resizeEvent = new Event('resize');
    window.dispatchEvent(resizeEvent);
}

// Hides the AR camera view and pauses tracking
function pauseAR() {
    getMindARSystem().stop();
    arScene.style.display = 'none';
}

// Shows the AR camera view again and resumes tracking
function resumeAR() {
    arScene.style.display = 'block';
    getMindARSystem().start();

    // After a short wait, fix the camera size and re-allow menus
    setTimeout(() => {
        triggerResize();
        resetTriggers();
    }, RESIZE_DELAY);
}


/* =====================================================================
   SHOW / HIDE THE PANORAMA VIEW
   Uses visibility + pointer-events instead of display, so the
   panorama's 3D canvas always has a real size (see style.css).
   ===================================================================== */
function showPanoramaContainer() {
    panoramaContainer.style.visibility = 'visible';   // make it visible
    panoramaContainer.style.pointerEvents = 'auto';   // let it receive touches
}

function hidePanoramaContainer() {
    panoramaContainer.style.visibility = 'hidden';    // make it invisible
    panoramaContainer.style.pointerEvents = 'none';   // let touches pass through
}


/* =====================================================================
   MENUS
   ===================================================================== */

// Closes both the picker and the action menu
function hideAllMenus() {
    pickerOverlay.style.display = 'none';
    actionOverlay.style.display = 'none';
}

// Opens the picker for a sub-target that covers several locations
function showPicker(targetCfg) {
    // Remember which picker this is, so the action menu can come back to it
    activePicker = targetCfg;

    // Use the custom title if there is one, otherwise a default
    if (targetCfg.pickerTitle) {
        pickerTitle.textContent = targetCfg.pickerTitle;
    } else {
        pickerTitle.textContent = "Select a Location";
    }

    // Remove any buttons left over from the last time the picker opened
    pickerBtns.innerHTML = "";

    // Make one button per location
    targetCfg.locations.forEach(locKey => {
        const loc = LOCATIONS[locKey];                // look up the location's data

        const btn = document.createElement('button'); // create a new button
        btn.className = 'btn btn-purple';             // style it
        btn.textContent = "📍 " + loc.name;           // label it

        // Clicking it closes the picker and opens that location's action menu
        btn.addEventListener('click', () => {
            pickerOverlay.style.display = 'none';
            showAction(locKey, true);                 // true = came from picker
        });

        pickerBtns.appendChild(btn);                  // add it to the menu
    });

    // Show the picker
    pickerOverlay.style.display = 'flex';
}

// Opens the action menu (photos / video / website) for one location
function showAction(locKey, fromPicker = false) {
    const loc = LOCATIONS[locKey];          // look up the location's data
    actionCameFromPicker = fromPicker;      // remember how we got here
    actionTitle.textContent = loc.name;     // set the menu title
    actionBtns.innerHTML = "";              // clear old buttons

    // --- 360° photo button (only if the location has photos) ---
    const hasPanoramas = loc.panoramas && loc.panoramas.length > 0;
    if (hasPanoramas) {
        const panoBtn = document.createElement('button');
        panoBtn.className = 'btn btn-gold';

        // Say "Photo" for one image, "Photos" for several
        if (loc.panoramas.length > 1) {
            panoBtn.textContent = "🔭 View 360° Photos";
        } else {
            panoBtn.textContent = "🔭 View 360° Photo";
        }

        panoBtn.addEventListener('click', () => enterPanorama(locKey));
        actionBtns.appendChild(panoBtn);
    }

    // --- Video button (only if the location has a video) ---
    if (loc.video) {
        const videoBtn = document.createElement('button');
        videoBtn.className = 'btn btn-green';
        videoBtn.textContent = "▶ Watch Location Video";
        videoBtn.addEventListener('click', () => enterVideo(locKey));
        actionBtns.appendChild(videoBtn);
    }

    // --- Website button (only if the location has a website) ---
    if (loc.website) {
        const webBtn = document.createElement('button');
        webBtn.className = 'btn btn-blue';
        webBtn.textContent = "🌐 Open Web Page";

        webBtn.addEventListener('click', () => {
            hideAllMenus();                         // close the menu
            window.open(loc.website, '_blank');     // open the site in a new tab
            resetTriggersAfter(WEBSITE_COOLDOWN);   // re-allow menus a bit later
        });

        actionBtns.appendChild(webBtn);
    }

    // The Back button's wording depends on how the user got here
    if (fromPicker) {
        actionBack.textContent = "← Choose Different Location";
    } else {
        actionBack.textContent = "✕ Stay Here";
    }

    // Show the action menu
    actionOverlay.style.display = 'flex';
}


/* =====================================================================
   PANORAMA VIEW
   ===================================================================== */

// Switches from AR to the 360° viewer for a location
function enterPanorama(locKey) {
    const loc = LOCATIONS[locKey];

    hideAllMenus();                     // close menus
    pauseAR();                          // stop the camera tracking and hide AR

    currentPanoList = loc.panoramas;    // which photos to cycle through
    currentPanoIndex = 0;               // start at the first photo
    currentPanoName = loc.name;         // name for the top bar

    showPanoramaContainer();            // reveal the 360° viewer
    loadPanorama(0);                    // display the first photo
}

// Shows photo number `index` and updates the top bar
function loadPanorama(index) {
    currentPanoIndex = index;
    const total = currentPanoList.length;

    // Point the sky at the new image. A-Frame loads and wraps it around
    // the viewer. This works because the canvas was sized correctly at
    // startup (visibility:hidden instead of display:none).
    const imagePath = currentPanoList[index];
    panoramaSky.setAttribute('src', imagePath);

    // Location name in the top bar
    panoLabel.textContent = currentPanoName;

    if (total > 1) {
        // Several photos: show the counter and the arrows
        const photoNumber = index + 1;      // humans count from 1, not 0
        panoCounter.textContent = "(" + photoNumber + " / " + total + ")";
        panoCounter.style.display = 'inline';
        prevPanoBtn.style.display = 'inline';
        nextPanoBtn.style.display = 'inline';

        // Grey out the arrows at the start and end of the list
        const isFirstPhoto = (index === 0);
        const isLastPhoto = (index === total - 1);
        prevPanoBtn.disabled = isFirstPhoto;
        nextPanoBtn.disabled = isLastPhoto;
    } else {
        // Only one photo: hide the counter and arrows
        panoCounter.style.display = 'none';
        prevPanoBtn.style.display = 'none';
        nextPanoBtn.style.display = 'none';
    }
}

// Leaves the 360° viewer and goes back to AR
function exitPanoramaView() {
    hidePanoramaContainer();
    resumeAR();
}

// Left arrow: go back one photo (if not already on the first)
prevPanoBtn.addEventListener('click', () => {
    if (currentPanoIndex > 0) {
        loadPanorama(currentPanoIndex - 1);
    }
});

// Right arrow: go forward one photo (if not already on the last)
nextPanoBtn.addEventListener('click', () => {
    const lastIndex = currentPanoList.length - 1;
    if (currentPanoIndex < lastIndex) {
        loadPanorama(currentPanoIndex + 1);
    }
});

// "Back to AR" button in the panorama bar
exitPanoramaBtn.addEventListener('click', () => exitPanoramaView());


/* =====================================================================
   VIDEO VIEW
   ===================================================================== */

// Switches from AR to the video player for a location
function enterVideo(locKey) {
    const loc = LOCATIONS[locKey];

    hideAllMenus();                         // close menus
    pauseAR();                              // stop tracking and hide AR

    locationVideo.src = loc.video;          // load this location's video
    videoContainer.style.display = 'flex';  // show the player
    locationVideo.play();                   // start playing
}

// Leaves the video player and goes back to AR
function exitVideoView() {
    locationVideo.pause();                  // stop playback
    locationVideo.removeAttribute('src');   // unload the file
    locationVideo.load();                   // reset the player so it frees memory
    videoContainer.style.display = 'none';  // hide the player
    resumeAR();
}

// "Back to AR" button on the video screen
exitVideoBtn.addEventListener('click', () => exitVideoView());


/* =====================================================================
   MENU BACK BUTTONS
   ===================================================================== */

// Picker "Stay Here": close menus, wait a bit before they can re-open
// (otherwise the camera would instantly re-trigger the same menu)
pickerBack.addEventListener('click', () => {
    hideAllMenus();
    resetTriggersAfter(MENU_COOLDOWN);
});

// Action menu Back button
actionBack.addEventListener('click', () => {
    actionOverlay.style.display = 'none';

    const shouldReturnToPicker = actionCameFromPicker && activePicker;

    if (shouldReturnToPicker) {
        // Came from a picker: go back to it
        showPicker(activePicker);
    } else {
        // Came straight from the map: close, then re-allow menus later
        resetTriggersAfter(MENU_COOLDOWN);
    }
});


/* =====================================================================
   START BUTTON
   ===================================================================== */

// Returns a Promise that finishes once the AR scene has loaded,
// or fails if it takes longer than SCENE_LOAD_TIMEOUT
function waitForSceneLoad() {
    return new Promise((resolve, reject) => {

        // If loading takes too long, fail with an error
        const timeoutId = setTimeout(() => {
            reject(new Error('Scene load timed out'));
        }, SCENE_LOAD_TIMEOUT);

        // When the scene finishes loading, cancel the timeout and succeed
        const onLoaded = () => {
            clearTimeout(timeoutId);
            resolve();
        };

        // { once: true } removes the listener after it fires one time
        arScene.addEventListener('loaded', onLoaded, { once: true });
    });
}

// Turns an error into a friendly message for the start screen
function getStartErrorMessage(err) {
    // Default message if we can't tell what went wrong
    if (!err) {
        return '⚠️ Could not start the camera.';
    }

    // Did the user (or browser) block camera access?
    const isPermissionName = (err.name === 'NotAllowedError');
    const mentionsPermission = Boolean(err.message) && err.message.includes('permission');

    if (isPermissionName || mentionsPermission) {
        return '⚠️ Camera access was denied. Please allow camera permission and try again.';
    }

    // Some other error that has a message: show it
    if (err.message) {
        return '⚠️ ' + err.message;
    }

    return '⚠️ Could not start the camera.';
}

startButton.addEventListener('click', async () => {
    // Show that we're working, and stop double-taps
    startButton.disabled = true;
    startButton.textContent = 'Starting…';
    loadingMsg.style.display = 'block';
    errorMsg.style.display = 'none';

    try {
        // Make sure A-Frame has finished building the scene first
        if (!arScene.hasLoaded) {
            await waitForSceneLoad();
        }

        // Turn on the camera and start looking for the map
        await getMindARSystem().start();

        // Success: hide the start screen
        overlay.style.display = 'none';

        // Fix the camera feed size after the overlay disappears
        setTimeout(triggerResize, START_RESIZE_DELAY);

    } catch (err) {
        // Something failed: log it for debugging
        console.error("AR start failed:", err);

        // Let the user try again
        startButton.disabled = false;
        startButton.textContent = 'Try Again';
        loadingMsg.style.display = 'none';

        // Explain what went wrong
        errorMsg.textContent = getStartErrorMessage(err);
        errorMsg.style.display = 'block';
    }
});


/* =====================================================================
   SUB-TARGET WIRING
   Connects each close-up target in the AR scene to its menu.
   ===================================================================== */
SUB_TARGETS.forEach((cfg, i) => {
    // The HTML ids start at 1 (subTarget1), but array positions start at 0
    const elementId = '#subTarget' + (i + 1);
    const entity = document.querySelector(elementId);

    // Fired by MindAR when the camera recognizes this target
    entity.addEventListener('targetFound', () => {
        // Already opened its menu? Do nothing.
        if (triggered[i]) {
            return;
        }

        // Mark it as opened so it won't re-fire
        triggered[i] = true;

        // Open the right kind of menu
        if (cfg.type === 'nested') {
            showPicker(cfg);
        } else {
            showAction(cfg.location, false);
        }
    });

    // Fired by MindAR when the camera loses sight of this target.
    // Clearing the flag lets the menu open again when it's found again.
    entity.addEventListener('targetLost', () => {
        triggered[i] = false;
    });
});
