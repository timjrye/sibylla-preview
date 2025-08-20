# SASS Setup for Sibylla Project

This project has been converted from CSS to SASS for better maintainability and organization.

## Files

- `styles/styles.scss` - Main styles converted from `styles.css`
- `styles/grid.scss` - Grid system converted from `styles/grid.css`
- `styles/watch-sass.sh` - Script to automatically compile SASS files when they change

## Features

### SASS Improvements
- **Variables**: Colors, breakpoints, and common values are now defined as variables
- **Mixins**: Reusable code blocks for media queries and common patterns
- **Nesting**: Better organization with nested selectors
- **Functions**: Dynamic grid column generation using SASS loops

### Key Variables
```scss
// Colors
$primary-color: #000;
$secondary-color: #333;
$accent-color: #A3FF2B;
$white: #fff;

// Breakpoints
$mobile: 480px;
$tablet: 768px;
$desktop: 1200px;
$large-desktop: 1400px;
```

### Key Mixins
```scss
@mixin mobile { @media (min-width: $mobile) { @content; } }
@mixin tablet { @media (min-width: $tablet) { @content; } }
@mixin desktop { @media (min-width: $desktop) { @content; } }
```

## Usage

### Manual Compilation
To compile SASS files once:
```bash
sass styles/styles.scss:styles/styles.css
sass styles/grid.scss:styles/grid.css
```

### Automatic Compilation (Recommended)
To watch for changes and automatically compile:
```bash
./styles/watch-sass.sh
```

This will:
- Watch both `styles/styles.scss` and `styles/grid.scss` files
- Automatically compile to `styles/styles.css` and `styles/grid.css` when changes are detected
- Run in the background until you press `Ctrl+C`

### SASS Options
You can also use additional SASS options:
```bash
# Compile with source map
sass --source-map styles/styles.scss:styles/styles.css

# Compile with compressed output
sass --style=compressed styles/styles.scss:styles/styles.css

# Watch with specific options
sass --watch --style=compressed styles/styles.scss:styles/styles.css
```

## Development Workflow

1. Edit the `.scss` files (not the `.css` files)
2. Run `./styles/watch-sass.sh` to start automatic compilation
3. Make changes to your SASS files
4. The CSS files will be automatically updated
5. Refresh your browser to see changes

## Notes

- The original CSS files are preserved as backups
- The SASS files include all the same functionality as the original CSS
- The compiled CSS files will be identical to the originals
- You can now use SASS features like variables, mixins, and nesting for easier maintenance
