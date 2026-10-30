# Frost landing page

A standalone, responsive landing page based on the supplied mockup. It includes a sample-file demo with browsing, list/grid views, filename search, Quick View, and light/dark appearance. The demo contains illustrative data only and never connects to Frost's file APIs.

Serve this directory with a static HTTP server. No build or dependencies are needed. Fonts are bundled locally under `assets/`, with their license.

The landing page has a WebGL vapour effect across the full viewport. Its fixed canvas is transparent and ignores pointer input. Cursor segments deposit momentum and two independently fading trail weights. A blurred flow texture and nested gradient noise transport the previous state. Rainbow colour comes from velocity; there is no density outline or artificial lens boundary.

`page-scene.js` draws the hero text and the sample-file demo into a transparent scene texture. It reads their DOM positions, fonts, backgrounds, borders, clipping and local SVG icons. List/grid layout, selected rows, folders and light/dark appearance come from the current demo DOM. The shader samples this scene nine times along the flow, so the demo's coloured rows, icons and panel edges can stretch into the wake. Other page content receives a transparent colour overlay.

The captured elements use `data-vapour-text` or `data-vapour-scene`. Their HTML remains in layout and in the accessibility tree. The canvas supplies their appearance only while a trail is visible. Pointer presses, keyboard input, text selection, Find and Quick View restore the real HTML. The scene renderer supports this page's text and demo elements; it is not a general HTML screenshot library. It captures no external content and uses no page-capture dependency.

`page-vapour.js` controls mounting. `intensity` and `refraction` remain at 1. The current tuning uses `flowSpeed: 0.7` to slow the existing wake independently of cursor input, `lifetime: 1.2` to retain momentum and trail weights longer, and `minRadius: 6` CSS pixels to make gentle strokes cover the simulation grid consistently. Fast-stroke radius scaling is unchanged. The colour window includes more of the moving folds, with reduced gain to keep the expanded coverage translucent.

`vapour-shaders.js` contains the independently written shaders, based on the supplied reverse-engineering analysis. `vapour.js` handles GPU resources, input and the render loop. The simulation runs at 60 updates per second, with cursor impulses measured in seconds and simulation pixels. Half-float buffers use continuous exponential weight decay and a smooth visibility fade. The byte-texture fallback retains its minimum positive/negative weight changes. The CPU stop condition follows the storage format's decay and rounding, and shares the shader's invisible threshold. No Lusion assets or runtime libraries are included.

The effect loads for a fine pointer with hover when reduced motion is off. It stops drawing once the trail fades, clears when the tab becomes hidden, and resumes on fresh pointer movement. Scrolling transports the existing wake with the page and refreshes the scene's viewport positions. Touch input is ignored. Unsupported WebGL, missing canvas text-spacing support, or initialization/context failures leave the normal HTML visible. The canvas uses quarter-resolution simulation buffers, eighth-resolution blurred flow buffers, and a display capped at 2× pixel density and 2560 × 1536. Layout changes, font loading and demo updates refresh the scene texture. Printing uses the normal HTML.

The installation section describes the current Linux source installation and clearly marks the GitHub repository as private. Update the availability copy when public distribution is ready.

Keep this website separate from the local Frost service. Only this directory's static files belong in a website deployment.
