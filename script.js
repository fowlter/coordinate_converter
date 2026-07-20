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

let topoSheets = [];
let topoSheetsLoaded = false;
let deferredInstallPrompt = null;

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
        document.getElementById('detailText').textContent = 'Topo50 data loaded successfully.';
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
            east: east.value,
            north: north.value
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
    document.getElementById("lat").value = formatNumber(currentCoordinate.lat, 6);
    document.getElementById("lon").value = formatNumber(currentCoordinate.lon, 6);
}

function inputCurrentGPS() {
    if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser.');
        return;
    }

    navigator.geolocation.getCurrentPosition(position => {
        document.getElementById('lat').value = formatNumber(position.coords.latitude, 6);
        document.getElementById('lon').value = formatNumber(position.coords.longitude, 6);
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
    const latParsed = parseNumberWithPrecision(latText);
    const lonParsed = parseNumberWithPrecision(lonText);

    if (!latParsed || !lonParsed) {
        alert('Please enter valid latitude and longitude values.');
        return;
    }

    const result = proj4(
        "EPSG:4326",
        "EPSG:2193",
        [lonParsed.value, latParsed.value]
    );

    currentCoordinate = {
        lat: latParsed.value,
        lon: lonParsed.value,
        east: result[0],
        north: result[1]
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
            east: eastParsed.value,
            north: northParsed.value
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

function toggleDisplay() {
    const saved = saveBottomInputAsCurrentCoordinate();
    if (!saved) {
        alert('Please enter a valid value in the bottom input before switching display modes.');
        return;
    }

    displayMode = displayMode == "NZTM" ? "TOPO50" : "NZTM";
    updateDisplay();
    updateLatLonInputs();
}

function updateDisplay() {
    document.getElementById("displayButton").textContent =
        "Display: " + displayMode;

    if (displayMode == "NZTM") {
        document.getElementById("resultLabel1").textContent = "Easting:";
        document.getElementById("resultLabel2").textContent = "Northing:";
        document.getElementById("result1").value =
            currentCoordinate.east !== null ? formatNumber(currentCoordinate.east, 3) : "";
        document.getElementById("result2").value =
            currentCoordinate.north !== null ? formatNumber(currentCoordinate.north, 3) : "";
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
    document.getElementById("detailText").textContent =
        `100km block origin: E=${blockOriginEast}, N=${blockOriginNorth}. Local metres: E=${localEast.toFixed(3)}, N=${localNorth.toFixed(3)}.`;
}

window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    const installButton = document.getElementById('installButton');
    if (installButton) {
        installButton.style.display = 'inline-block';
    }
});

window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    const installButton = document.getElementById('installButton');
    if (installButton) {
        installButton.style.display = 'none';
    }
    document.getElementById('detailText').textContent = 'App installed.';
});

function promptInstall() {
    if (!deferredInstallPrompt) {
        alert('Install prompt not available yet. Please visit the page again or use your browser menu to install.');
        return;
    }

    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(choiceResult => {
        if (choiceResult.outcome === 'accepted') {
            document.getElementById('detailText').textContent = 'Thanks for installing the app!';
        } else {
            document.getElementById('detailText').textContent = 'Install dismissed. You can install later from the browser menu.';
        }
        deferredInstallPrompt = null;
        const installButton = document.getElementById('installButton');
        if (installButton) {
            installButton.style.display = 'none';
        }
    });
}

window.addEventListener('load', async () => {
    await loadTopo50Data();
    updateDisplay();

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
        if (!deferredInstallPrompt) pwaHints.push('browser has not fired install prompt yet');
        statusEl.textContent = `PWA status: icons=${iconsOk}, swControlled=${swControlled}` + (pwaHints.length ? ' — ' + pwaHints.join('; ') : ' — eligible');
    } catch (e) {
        document.getElementById('installStatus').textContent = 'Install status check failed: ' + e.message;
    }
}

// run a short check shortly after load and after service worker registration
window.addEventListener('load', () => setTimeout(checkInstallStatus, 1000));
