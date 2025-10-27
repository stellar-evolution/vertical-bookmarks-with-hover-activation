# Vertical Bookmarks with Hover Activation

Made a simple browser extension that adds a vertical bookmarks sidebar with hover activation. The regular horizontal bookmarks bar is cooked as hell so I wanted one that keeps all your bookmarks vertically on the side of my browser that opens whenever you hit the edge of your screen. I recommend that you set your bookmarks bar to 'only show on new tab' so that way you can get rid of the space your bookmarks bar takes up horizontally once you leave the new tab page -- don't set to never show unless you don't mind not being able to see bookmarks, native horizontal or my vertical popout bookmarks, on the new tab page (NTP) at all.

This is because the new tab page is technically internal for all browsers, so extensions can't activate on actual default new tab pages -- so if you open a new tab keep your bookmarks bar open with **'only show on new tab'.** so you can still see your horizontal bookmarks on the NTP. (as soon as you leave the default NTP you can activate the vertical bookmarks popout)

I've built the custom new tab page required to allow my vertical bookmarks extension to work on my new tab page, but atm it's only customized to my name + backgrounds + languages.

Will probably build a UI for public custom NTP as well but for now will assume most people don't wanna switch up their whole New Tab just to test out my side project but yeah lmk

**Note:** This isn't on the Chrome Web Store (yet), so you'll need to install it manually using developer mode.

## What It Does

- Shows a vertical sidebar on the right side of your browser
- Displays all your existing bookmarks
- Activates on hover (hover near the edge to open it)
- Works on any website

## Installation

Since this isn't published yet, you'll need to install it manually:

### Step 1: Download the Extension

1. Click the green "Code" button at the top of this page
2. Select "Download ZIP"
3. Unzip the file on your computer

### Step 2: Enable Developer Mode in Chrome/Edge

1. Open Chrome or Edge
2. Go to `chrome://extensions/` (or `edge://extensions/` for Edge)
3. **Turn ON Developer mode** (toggle in the top right corner)

### Step 3: Install the Extension

1. Click the "Load unpacked" button
2. Navigate to the folder where you unzipped the extension
3. Select the folder and click "Select Folder"
4. Done! The extension should now appear in your extensions list

## How to Use

1. Navigate to any website
2. Move your mouse to the right edge of your browser
3. The bookmarks sidebar should appear with all your bookmarks
4. Hover away to hide it again

## Permissions

The extension needs the following permissions (all standard for bookmark extensions):
- Access to your bookmarks (to display them)
- The ability to inject the sidebar on web pages
- Storage to remember your preferences

## Troubleshooting

- **Sidebar not appearing?** Make sure the extension is enabled in `chrome://extensions/`
- **Having permission issues?** The extension will ask for permissions when first installed
- **Want to remove it?** Just click the trash icon in `chrome://extensions/`

Let me know what y'all think

