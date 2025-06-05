// src/ui/paletteManager.js

const paletteMap = {
    'NumbersP': 'drawPalette',
    'RoomsP': 'roomsPalette',
    'IconsP': 'iconsPalette'
};

const buttonMap = {
    'NumbersP': 'numbersBtn',
    'RoomsP': 'roomsBtn',
    'IconsP': 'iconsBtn'
};

const allPaletteIds = Object.values(paletteMap);
const allButtonIds = Object.values(buttonMap);

export function ShowPallet(paletteKeyToShow) {
    const paletteIdToShow = paletteMap[paletteKeyToShow];
    const activeButtonId = buttonMap[paletteKeyToShow];

    const allPalettes = document.querySelectorAll('.bottom-palette');
    allPalettes.forEach(palette => {
        palette.classList.add('hidden');
    });

    if (paletteIdToShow) {
        const targetPalette = document.getElementById(paletteIdToShow);
        if (targetPalette) {
            targetPalette.classList.remove('hidden');
        } else {
            console.error(`Palette with ID "${paletteIdToShow}" not found.`);
        }
    } else {
        console.error(`No palette mapped for key "${paletteKeyToShow}".`);
    }

    allButtonIds.forEach(id => {
        const button = document.getElementById(id);
        if (button) {
            button.classList.remove('active');
        }
    });

    if (activeButtonId) {
        const activeButton = document.getElementById(activeButtonId);
        if (activeButton) {
            activeButton.classList.add('active');
        }
    }
}

export function toggleAngle() {
    const angleDisplay = document.getElementById('angleDisplay');
    if (angleDisplay) {
        angleDisplay.classList.toggle('hidden');
    } else {
        console.error("Angle display element with ID 'angleDisplay' not found.");
    }
}

export function isAngleModeActive() {
    const angleDisplay = document.getElementById('angleDisplay');
    return angleDisplay ? !angleDisplay.classList.contains('hidden') : false;
}

export function getAngleFromInput() {
    const angleDisplay = document.getElementById('angleDisplay');
    if (angleDisplay) {
        const value = angleDisplay.value.replace('°', '');
        const angle = parseFloat(value);
        return isNaN(angle) ? 0 : angle;
    }
    return 0;
}