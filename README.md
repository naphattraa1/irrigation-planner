# AI-Assisted Irrigation Planning System

A professional, interactive web application for irrigation system planning with real-time calculations, interactive maps, and hydraulic validation.

## Features

- **FAO-56 Water Demand Calculation** - Accurate crop water requirement calculations
- **Hazen-Williams Head Loss Analysis** - Hydraulic pressure drop calculations
- **Interactive Map** - Leaflet.js integration with pipeline layout visualization
- **Real-time Calculations** - Auto-updates as you change inputs
- **Hydraulic Validation** - Automatic system validation with recommendations
- **Bill of Materials (BOM)** - Complete cost estimation
- **Responsive Design** - Works on desktop, tablet, and mobile devices

## Getting Started

1. Open `index.html` in a modern web browser
2. No build process or server required - works directly from the file system
3. All dependencies are loaded from CDN (Font Awesome, Leaflet.js, Google Fonts)

## Usage

1. **Enter Farm Parameters**
   - Adjust area using the slider or number input
   - Select crop coefficient (Kc) from dropdown
   - Enter ET₀ (reference evapotranspiration) in mm/day
   - Enter rainfall in mm/day

2. **Configure Hydraulic Settings**
   - Select main pipe diameter
   - Set maximum lateral length

3. **Generate Layout**
   - Click "Generate Layout" to visualize pipeline on map
   - Click "Validate Hydraulics" to check system constraints
   - Click "BOM" to view bill of materials
   - Click "Finalize Design" to see complete summary

## Calculations

- **Water Demand**: Uses FAO-56 method (ETc = Kc × ET₀)
- **Head Loss**: Hazen-Williams formula for pressure drop
- **Pipe Length**: Heuristic based on area and layout
- **Max Lateral Length**: Calculated from hydraulic constraints
- **BOM**: Includes pipes, fittings, valves, emitters, pump, and controller

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge

## File Structure

```
irrigation-planner/
├── index.html      # Main HTML file
├── styles.css      # All styling
├── script.js       # Calculation logic and interactions
├── assets/         # Images and other assets (optional)
└── README.md       # This file
```

## Customization

- Colors: Edit CSS variables in `styles.css` (`:root` section)
- Calculations: Modify functions in `script.js`
- Map location: Change coordinates in `initializeMap()` function

## Notes

- Map uses OpenStreetMap tiles (free, no API key required)
- Satellite imagery uses Esri World Imagery
- All calculations are client-side (no server needed)
- Default map location is set to Bangkok, Thailand (can be changed)

