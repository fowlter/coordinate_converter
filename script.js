proj4.defs(
    "EPSG:2193",
    "+proj=tmerc +lat_0=0 +lon_0=173 +k=0.9996 +x_0=1600000 +y_0=10000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs"
);

let currentCoordinate = {
    lat: null,
    lon: null,
    east: null,
    north: null
};

let displayMode = "NZTM";
let topDisplayMode = "DD";

let topoSheets = [];
let topoSheetsLoaded = false;
let deferredInstallPrompt = null;
let appInstalled = false;

function isIos() {
    const ua = window.navigator.userAgent || '';
    const platform = window.navigator.platform || '';
    const isIosUa = /iphone|ipad|ipod/i.test(ua);
    const isIosPlatform = /iphone|ipad|ipod/i.test(platform);
    const isTouchMac = platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return isIosUa || isIosPlatform || isTouchMac;
}

function isIosSafari() {
    const ua = window.navigator.userAgent || '';
    return /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
}

function isAndroid() {
    const ua = window.navigator.userAgent || '';
    return /android/i.test(ua);
}

function isDesktop() {
    return !isIos() && !isAndroid();
}

function isChromeFamily() {
    const ua = window.navigator.userAgent || '';
    return /chrome|crios|chromium|edg|edgios|opr|opera|samsungbrowser/i.test(ua) && !/firefox|fxios/i.test(ua);
}

function isFirefoxFamily() {
    const ua = window.navigator.userAgent || '';
    return /firefox|fxios/i.test(ua);
}

function isStandaloneMode() {
    const standaloneMedia = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    const iosStandalone = typeof navigator.standalone === 'boolean' && navigator.standalone;
    return !!standaloneMedia || !!iosStandalone;
}

function getIosInstallInstructions() {
    return 'On iPhone Safari, install from the browser menu: tap the Share icon and choose "Add to Home Screen".';
}

function getInstallInstructions() {
    if (isStandaloneMode() || appInstalled) {
        return 'This app is already installed on this device. Open it from your Home Screen or app launcher.';
    }

    if (isIos()) {
        if (isIosSafari()) {
            return 'On iPhone/iPad Safari: tap Share, then choose "Add to Home Screen".';
        }
        return 'On iPhone/iPad: open this site in Safari, then tap Share and choose "Add to Home Screen".';
    }

    if (isAndroid()) {
        if (isFirefoxFamily()) {
            return 'On Android Firefox: open the browser menu and choose "Add to Home screen".';
        }
        return 'On Android: open the browser menu and choose "Install app" or "Add to Home screen".';
    }

    if (isDesktop()) {
        if (isFirefoxFamily()) {
            return 'On desktop Firefox: install support is limited; use the browser menu/bookmark options, or use Chrome/Edge for installable app behavior.';
        }
        if (isChromeFamily()) {
            return 'On desktop Chrome/Edge: click the install icon in the address bar, or open the browser menu and choose "Install app".';
        }
        return 'On desktop: open the browser menu and look for "Install app" or "Add to Applications".';
    }

    return 'Use your browser menu to install this app to your Home Screen or app list.';
}

async function loadTopo50Data() {
    const topo50Url = new URL('topo50.json', location.href).href;
    document.getElementById('detailText').textContent = 'Loading Topo50 data...';

    try {
        const response = await fetch(topo50Url);
        if (!response.ok) {
            const message = `Topo50 data fetch failed: HTTP ${response.status} (${topo50Url})`;
            topoSheetsLoaded = false;
            document.getElementById('detailText').textContent = message;
            console.warn(message);
            return;
        }
        topoSheets = await response.json();
        topoSheetsLoaded = true;
        document.getElementById('detailText').textContent = '';
    } catch (error) {
        topoSheetsLoaded = false;
        const message = `Failed to load topo50.json from ${topo50Url}: ${error.message}`;
        document.getElementById('detailText').textContent = message;
        console.warn(message, error);
    }
}

function parseNumberWithPrecision(text) {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const value = Number(trimmed);
    if (!Number.isFinite(value)) return null;
    const match = trimmed.match(/^[-+]?\d+(?:\.(\d+))?$/);
    const decimals = match && match[1] ? match[1].length : 0;
    return { value, decimals };
}

function formatNumber(value, decimals) {
    if (decimals < 0) decimals = 0;
    let formatted = Number.isInteger(value) && decimals === 0
        ? value.toString()
        : value.toFixed(decimals);
    formatted = formatted.replace(/\.0+$/, '').replace(/(\.\d*?[1-9])0+$/, '$1');
    return formatted;
}

function roundToMeter(value) {
    return Math.round(value);
}

function formatNzTm(value) {
    return formatNumber(roundToMeter(value), 0);
}

function formatNumberFromInput(value, inputText, defaultDecimals) {
    const parsed = parseNumberWithPrecision(inputText || '');
    if (parsed) {
        if (parsed.decimals > 0) {
            return formatNumber(value, parsed.decimals);
        }
        return Number.isInteger(value)
            ? value.toString()
            : formatNumber(value, defaultDecimals || 0);
    }
    return formatNumber(value, defaultDecimals || 0);
}

function parseDmsCoordinate(text, isLat) {
    if (!text) return null;
    const upper = text.trim().toUpperCase();
    if (!upper) return null;

    const hemisphereMatches = [];
    const hemisphereRegex = /(?:^|[^A-Z])(N|S|E|W)(?=$|[^A-Z])/g;
    let hemisphereMatch;
    while ((hemisphereMatch = hemisphereRegex.exec(upper)) !== null) {
        hemisphereMatches.push(hemisphereMatch[1]);
    }
    const hasSouthOrWest = hemisphereMatches.some(h => h === 'S' || h === 'W');
    const hasNorthOrEast = hemisphereMatches.some(h => h === 'N' || h === 'E');
    const hasLeadingMinus = /^\s*-/.test(upper);
    const firstNumber = upper.match(/[-+]?\d+(?:\.\d+)?/);
    const hasNegativeDegree = !!(firstNumber && firstNumber[0].startsWith('-'));

    const cleaned = upper
        .replace(/[NSEW]/g, ' ')
        .replace(/[A-Z]/g, ' ')
        .replace(/[+\-]/g, ' ')
        .replace(/[^0-9.\s]+/g, ' ')
        .trim();

    if (!cleaned) return null;
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length === 0 || parts.length > 3) return null;

    const deg = Number(parts[0]);
    const min = parts.length > 1 ? Number(parts[1]) : 0;
    const sec = parts.length > 2 ? Number(parts[2]) : 0;

    if (!Number.isFinite(deg) || !Number.isFinite(min) || !Number.isFinite(sec)) return null;
    if (deg < 0 || min < 0 || sec < 0) return null;
    if (min >= 60 || sec >= 60) return null;

    let sign = 1;
    if (hasSouthOrWest || hasLeadingMinus || hasNegativeDegree) sign = -1;
    if (hasNorthOrEast && !hasSouthOrWest && !hasLeadingMinus && !hasNegativeDegree) sign = 1;

    const value = sign * (deg + min / 60 + sec / 3600);
    const maxAbs = isLat ? 90 : 180;
    if (Math.abs(value) > maxAbs) return null;
    return value;
}

function parseAngleInput(text, isLat) {
    const parsed = parseNumberWithPrecision(text || '');
    if (parsed) {
        const maxAbs = isLat ? 90 : 180;
        if (Math.abs(parsed.value) > maxAbs) return null;
        return parsed.value;
    }
    return parseDmsCoordinate(text || '', isLat);
}

function formatDms(value, isLat) {
    const hemisphere = value < 0 ? (isLat ? 'S' : 'W') : (isLat ? 'N' : 'E');
    const absValue = Math.abs(value);
    let degrees = Math.floor(absValue);
    const minutesFloat = (absValue - degrees) * 60;
    let minutes = Math.floor(minutesFloat);
    let seconds = (minutesFloat - minutes) * 60;

    seconds = Math.round(seconds * 100) / 100;
    if (seconds >= 60) {
        seconds = 0;
        minutes += 1;
    }
    if (minutes >= 60) {
        minutes = 0;
        degrees += 1;
    }

    return `${degrees}° ${minutes}' ${formatNumber(seconds, 2)}\" ${hemisphere}`;
}

function saveTopInputAsCurrentCoordinate() {
    const latRaw = document.getElementById("lat").value.trim();
    const lonRaw = document.getElementById("lon").value.trim();

    if (!latRaw && !lonRaw) {
        return currentCoordinate.lat !== null && currentCoordinate.lon !== null;
    }

    const lat = parseAngleInput(latRaw, true);
    const lon = parseAngleInput(lonRaw, false);
    if (lat === null || lon === null) return false;

    const result = proj4("EPSG:4326", "EPSG:2193", [lon, lat]);
    currentCoordinate = {
        lat,
        lon,
        east: roundToMeter(result[0]),
        north: roundToMeter(result[1])
    };
    return true;
}

function saveBottomInputAsCurrentCoordinate() {
    const raw1 = document.getElementById("result1").value.trim();
    const raw2 = document.getElementById("result2").value.trim();

    if (!raw1 && !raw2) {
        return currentCoordinate.lat !== null && currentCoordinate.lon !== null;
    }

    if (displayMode === "NZTM") {
        const east = parseNumberWithPrecision(raw1);
        const north = parseNumberWithPrecision(raw2);
        if (!east || !north) return false;
        const result = proj4(
            "EPSG:2193",
            "EPSG:4326",
            [east.value, north.value]
        );
        currentCoordinate = {
            lat: result[1],
            lon: result[0],
            east: roundToMeter(east.value),
            north: roundToMeter(north.value)
        };
        return true;
    }

    const sheetCode = raw1.toUpperCase();
    const sheet = findTopo50SheetByCode(sheetCode);
    const grid = parseTopo50Grid(raw2);
    if (!sheet || !grid) return false;

    const resolved = resolveTopo50GridToNzTm(sheet, grid);
    if (!resolved) return false;

    const result = proj4(
        "EPSG:2193",
        "EPSG:4326",
        [resolved.east, resolved.north]
    );
    currentCoordinate = {
        lat: result[1],
        lon: result[0],
        east: resolved.east,
        north: resolved.north
    };
    return true;
}

function updateLatLonInputs() {
    if (currentCoordinate.lat === null || currentCoordinate.lon === null) return;
    if (topDisplayMode === "DD") {
        document.getElementById("lat").value = formatNumber(currentCoordinate.lat, 6);
        document.getElementById("lon").value = formatNumber(currentCoordinate.lon, 6);
        return;
    }
    document.getElementById("lat").value = formatDms(currentCoordinate.lat, true);
    document.getElementById("lon").value = formatDms(currentCoordinate.lon, false);
}

function updateTopDisplay() {
    const ddButton = document.getElementById("topModeDd");
    const dmsButton = document.getElementById("topModeDms");
    const latLabel = document.getElementById("latLabel");
    const lonLabel = document.getElementById("lonLabel");

    if (ddButton && dmsButton) {
        ddButton.classList.toggle('active', topDisplayMode === "DD");
        dmsButton.classList.toggle('active', topDisplayMode === "DMS");
        ddButton.setAttribute('aria-pressed', topDisplayMode === "DD" ? 'true' : 'false');
        dmsButton.setAttribute('aria-pressed', topDisplayMode === "DMS" ? 'true' : 'false');
    }
    if (latLabel) {
        latLabel.textContent = topDisplayMode === "DD" ? "Latitude:" : "Latitude (DMS):";
    }
    if (lonLabel) {
        lonLabel.textContent = topDisplayMode === "DD" ? "Longitude:" : "Longitude (DMS):";
    }
}

function setTopDisplayMode(mode) {
    if (mode !== "DD" && mode !== "DMS") return;

    const saved = saveTopInputAsCurrentCoordinate();
    topDisplayMode = mode;
    updateTopDisplay();
    // Only rewrite field values when we successfully parsed the current inputs.
    // This keeps blank or in-progress values editable while still allowing mode switch.
    if (saved) {
        updateLatLonInputs();
    }
}

function toggleTopDisplay() {
    setTopDisplayMode(topDisplayMode === "DD" ? "DMS" : "DD");
}

function inputCurrentGPS() {
    if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser.');
        return;
    }

    navigator.geolocation.getCurrentPosition(position => {
        currentCoordinate.lat = position.coords.latitude;
        currentCoordinate.lon = position.coords.longitude;
        updateLatLonInputs();
        document.getElementById('detailText').textContent = 'GPS coordinates loaded successfully.';
    }, error => {
        let message = 'Unable to retrieve GPS location.';

        if (location.protocol === 'file:') {
            message += ' Your page is opened via file://, and Chrome blocks geolocation on insecure origins.';
            message += ' Run a local server (for example, using Python or Live Server) and open the page with http://localhost.';
        } else if (error.code === 1) {
            message += ' Permission was denied. Please allow location access in your browser.';
        } else if (error.code === 2) {
            message += ' The location is unavailable.';
        } else if (error.code === 3) {
            message += ' The request timed out. Try again or check your device location settings.';
        }

        if (error.message) {
            message += ' (' + error.message + ')';
        }

        document.getElementById('detailText').textContent = message;
        alert(message);
    }, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000
    });
}

function convertTopToBottom() {
    const latText = document.getElementById("lat").value.trim();
    const lonText = document.getElementById("lon").value.trim();
    const lat = parseAngleInput(latText, true);
    const lon = parseAngleInput(lonText, false);

    if (lat === null || lon === null) {
        alert('Please enter valid latitude and longitude values.');
        return;
    }

    const result = proj4(
        "EPSG:4326",
        "EPSG:2193",
        [lon, lat]
    );

    currentCoordinate = {
        lat,
        lon,
        east: roundToMeter(result[0]),
        north: roundToMeter(result[1])
    };

    updateLatLonInputs();
    updateDisplay();
}

function convertBottomToTop() {
    if (displayMode == "NZTM") {
        const rawEast = document.getElementById("result1").value.trim();
        const rawNorth = document.getElementById("result2").value.trim();
        const eastParsed = parseNumberWithPrecision(rawEast);
        const northParsed = parseNumberWithPrecision(rawNorth);

        if (!eastParsed || !northParsed) {
            alert('Please enter valid NZTM Easting and Northing values.');
            return;
        }

        const result = proj4(
            "EPSG:2193",
            "EPSG:4326",
            [eastParsed.value, northParsed.value]
        );

        currentCoordinate = {
            lat: result[1],
            lon: result[0],
            east: roundToMeter(eastParsed.value),
            north: roundToMeter(northParsed.value)
        };
        updateLatLonInputs();
        updateDisplay();
        return;
    }

    if (!topoSheetsLoaded) {
        alert('Topo50 data is not yet loaded. Please wait and try again.');
        return;
    }

    const sheetCode = document.getElementById("result1").value.trim().toUpperCase();
    const gridText = document.getElementById("result2").value.trim();
    const sheet = findTopo50SheetByCode(sheetCode);

    if (!sheet) {
        alert('Sheet code not found. Please enter a valid Topo50 sheet code like BJ38.');
        return;
    }

    const grid = parseTopo50Grid(gridText);
    if (!grid) {
        alert('Please enter a valid Topo50 grid reference like 284 913 or 2840 9130.');
        return;
    }

    const resolved = resolveTopo50GridToNzTm(sheet, grid);
    if (!resolved) {
        alert('Grid reference does not appear to lie within sheet ' + sheet.sheet + '.');
        return;
    }

    const east = resolved.east;
    const north = resolved.north;

    const result = proj4(
        "EPSG:2193",
        "EPSG:4326",
        [east, north]
    );

    currentCoordinate = {
        lat: result[1],
        lon: result[0],
        east: east,
        north: north
    };
    updateLatLonInputs();
    updateDisplay();
}

function parseTopo50Grid(text) {
    const parts = text.match(/\d+/g);
    if (!parts) return null;

    const parseAsMeters = (value, multiplier) => parseInt(value, 10) * multiplier;

    if (parts.length === 2) {
        const eastText = parts[0];
        const northText = parts[1];
        if (eastText.length === 3 && northText.length === 3) {
            return {
                east: parseAsMeters(eastText, 100),
                north: parseAsMeters(northText, 100)
            };
        }
        if (eastText.length === 4 && northText.length === 4) {
            return {
                east: parseAsMeters(eastText, 10),
                north: parseAsMeters(northText, 10)
            };
        }
        if (eastText.length === 5 && northText.length === 5) {
            return {
                east: parseAsMeters(eastText, 1),
                north: parseAsMeters(northText, 1)
            };
        }
        // Accept any same-length pair as a local grid in metres or 10m/100m units.
        if (eastText.length === northText.length) {
            const multiplier = eastText.length === 3 ? 100 : eastText.length === 4 ? 10 : 1;
            return {
                east: parseAsMeters(eastText, multiplier),
                north: parseAsMeters(northText, multiplier)
            };
        }
        return null;
    }

    if (parts.length === 1) {
        const digits = parts[0];
        if (digits.length === 6) {
            return {
                east: parseAsMeters(digits.slice(0, 3), 100),
                north: parseAsMeters(digits.slice(3), 100)
            };
        }
        if (digits.length === 8) {
            return {
                east: parseAsMeters(digits.slice(0, 4), 10),
                north: parseAsMeters(digits.slice(4), 10)
            };
        }
        if (digits.length === 10) {
            return {
                east: parseAsMeters(digits.slice(0, 5), 1),
                north: parseAsMeters(digits.slice(5), 1)
            };
        }
    }

    return null;
}

function findTopo50SheetByCode(sheetCode) {
    return topoSheets.find(sheet => sheet.sheet.toUpperCase() === sheetCode);
}

function resolveTopo50GridToNzTm(sheet, grid) {
    const minOriginE = Math.floor((sheet.minEast - grid.east) / 100000);
    const maxOriginE = Math.floor((sheet.maxEast - grid.east) / 100000);
    const minOriginN = Math.floor((sheet.minNorth - grid.north) / 100000);
    const maxOriginN = Math.floor((sheet.maxNorth - grid.north) / 100000);

    for (let eOrigin = minOriginE; eOrigin <= maxOriginE; eOrigin++) {
        for (let nOrigin = minOriginN; nOrigin <= maxOriginN; nOrigin++) {
            const east = eOrigin * 100000 + grid.east;
            const north = nOrigin * 100000 + grid.north;
            if (east >= sheet.minEast && east < sheet.maxEast && north >= sheet.minNorth && north < sheet.maxNorth) {
                return { east, north };
            }
        }
    }

    return null;
}

function setBottomDisplayMode(mode) {
    if (mode !== "NZTM" && mode !== "TOPO50") return;

    displayMode = mode;
    updateDisplay();
    updateLatLonInputs();
}

function toggleDisplay() {
    setBottomDisplayMode(displayMode == "NZTM" ? "TOPO50" : "NZTM");
}

function updateDisplay() {
    const nztmButton = document.getElementById("bottomModeNztm");
    const topoButton = document.getElementById("bottomModeTopo50");
    if (nztmButton && topoButton) {
        nztmButton.classList.toggle('active', displayMode === "NZTM");
        topoButton.classList.toggle('active', displayMode === "TOPO50");
        nztmButton.setAttribute('aria-pressed', displayMode === "NZTM" ? 'true' : 'false');
        topoButton.setAttribute('aria-pressed', displayMode === "TOPO50" ? 'true' : 'false');
    }

    if (displayMode == "NZTM") {
        document.getElementById("resultLabel1").textContent = "Easting:";
        document.getElementById("resultLabel2").textContent = "Northing:";
        document.getElementById("result1").value =
            currentCoordinate.east !== null ? formatNzTm(currentCoordinate.east) : "";
        document.getElementById("result2").value =
            currentCoordinate.north !== null ? formatNzTm(currentCoordinate.north) : "";
    } else {
        document.getElementById("resultLabel1").textContent = "Sheet:";
        document.getElementById("resultLabel2").textContent = "Grid:";
        displayTopo50();
    }
}

function findTopo50Sheet(east, north) {
    return topoSheets.find(sheet =>
        east >= sheet.minEast && east < sheet.maxEast &&
        north >= sheet.minNorth && north < sheet.maxNorth
    );
}

function displayTopo50() {
    if (!topoSheetsLoaded) {
        document.getElementById("result1").value = "Topo50 data unavailable";
        document.getElementById("result2").value = "";
        return;
    }

    const sheet = findTopo50Sheet(currentCoordinate.east, currentCoordinate.north);

    if (!sheet) {
        document.getElementById("result1").value = "Out of range";
        document.getElementById("result2").value = "";
        document.getElementById("detailText").textContent = "";
        return;
    }

    const blockOriginEast = Math.floor(currentCoordinate.east / 100000) * 100000;
    const blockOriginNorth = Math.floor(currentCoordinate.north / 100000) * 100000;
    const localEast = currentCoordinate.east - blockOriginEast;
    const localNorth = currentCoordinate.north - blockOriginNorth;
    const eastGrid = Math.floor(localEast / 100);
    const northGrid = Math.floor(localNorth / 100);
    const eastText = eastGrid.toString().padStart(3, "0");
    const northText = northGrid.toString().padStart(3, "0");

    document.getElementById("result1").value = sheet.sheet;
    document.getElementById("result2").value = `${eastText} ${northText}`;
    document.getElementById("detailText").textContent = "";
}

window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    const installButton = document.getElementById('installButton');
    if (installButton) {
        installButton.style.display = 'inline-block';
        installButton.textContent = 'Install App';
    }
});

window.addEventListener('appinstalled', () => {
    appInstalled = true;
    deferredInstallPrompt = null;
    const installButton = document.getElementById('installButton');
    if (installButton) {
        installButton.textContent = 'App Installed';
    }
    document.getElementById('detailText').textContent = 'App installed.';
});

function promptInstall() {
    if (isStandaloneMode() || appInstalled) {
        const installedMessage = 'This app is already installed on this device.';
        alert(installedMessage);
        document.getElementById('detailText').textContent = installedMessage;
        return;
    }

    if (!deferredInstallPrompt) {
        const instructions = getInstallInstructions();
        alert(instructions);
        document.getElementById('detailText').textContent = instructions;
        return;
    }

    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(choiceResult => {
        if (choiceResult.outcome === 'accepted') {
            document.getElementById('detailText').textContent = 'Thanks for installing the app!';
            appInstalled = true;
            const installButton = document.getElementById('installButton');
            if (installButton) {
                installButton.textContent = 'App Installed';
            }
        } else {
            document.getElementById('detailText').textContent = 'Install dismissed. ' + getInstallInstructions();
        }
        deferredInstallPrompt = null;
    });
}

window.addEventListener('load', async () => {
    appInstalled = isStandaloneMode();

    await loadTopo50Data();
    updateTopDisplay();
    updateDisplay();

    const installButton = document.getElementById('installButton');
    if (installButton && appInstalled) {
        installButton.textContent = 'App Installed';
    }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(reg => {
                console.log('Service worker registered:', reg);
                setTimeout(checkInstallStatus, 500);
            })
            .catch(error => {
                console.warn('Service worker registration failed:', error);
                setTimeout(checkInstallStatus, 500);
            });
    }
});

async function checkInstallStatus() {
    const statusEl = document.getElementById('installStatus');
    if (!statusEl) return;
    try {
        const manifestUrl = new URL('manifest.json', location.href).href;
        const r = await fetch(manifestUrl, {cache: 'no-store'});
        if (!r.ok) {
            statusEl.textContent = `Manifest fetch failed: HTTP ${r.status}`;
            return;
        }
        const m = await r.json();
        const iconsOk = Array.isArray(m.icons) && m.icons.length > 0;
        const swControlled = !!navigator.serviceWorker && !!navigator.serviceWorker.controller;
        const pwaHints = [];
        if (!iconsOk) pwaHints.push('manifest has no icons');
        if (!swControlled) pwaHints.push('service worker not controlling page');
        if (isIos()) {
            pwaHints.push('iOS detected — use Share → Add to Home Screen');
        } else if (!deferredInstallPrompt) {
            pwaHints.push('browser has not fired install prompt yet');
        }
        statusEl.textContent = `PWA status: icons=${iconsOk}, swControlled=${swControlled}` + (pwaHints.length ? ' — ' + pwaHints.join('; ') : ' — eligible');
    } catch (e) {
        document.getElementById('installStatus').textContent = 'Install status check failed: ' + e.message;
    }
}

// run a short check shortly after load and after service worker registration
window.addEventListener('load', () => setTimeout(checkInstallStatus, 1000));
