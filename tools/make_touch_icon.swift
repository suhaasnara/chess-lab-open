// The home-screen icon (apple-touch-icon): the favicon's cburnett knight (site/assets/pieces/cburnett/wN.svg, GPLv2+)
// on the site's navy (#13284a), 180 x 180 px, opaque, square (iOS rounds the corners itself). Roadmap #399, 27 Nov 2026:
// the site had only the SVG favicon, so Add to Home Screen on an iPhone showed a shrunken screenshot.
//
//   swift tools/make_touch_icon.swift        (on a Mac; writes site/apple-touch-icon.png)
import AppKit

let root = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent().deletingLastPathComponent()
let svg = root.appendingPathComponent("site/assets/pieces/cburnett/wN.svg")
guard let knight = NSImage(contentsOf: svg) else { print("make_touch_icon FAILED: can't read \(svg.path)"); exit(1) }

let size = 180
let side: CGFloat = 170                  // the 45-unit piece square; the knight itself spans about 33 of its 45 units
let lift: CGFloat = side * 1.5 / 45      // the knight sits 1.5 units low in its square: lift it to the middle

let cs = CGColorSpace(name: CGColorSpace.sRGB)!
guard let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: cs,
                          bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { exit(1) }   // no alpha channel
ctx.setFillColor(CGColor(srgbRed: 0x13 / 255.0, green: 0x28 / 255.0, blue: 0x4a / 255.0, alpha: 1))
ctx.fill(CGRect(x: 0, y: 0, width: size, height: size))
ctx.interpolationQuality = .high
let o = (CGFloat(size) - side) / 2
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: false)
knight.draw(in: NSRect(x: o, y: o + lift, width: side, height: side))
NSGraphicsContext.restoreGraphicsState()

let rel = "site/apple-touch-icon.png"
try! NSBitmapImageRep(cgImage: ctx.makeImage()!).representation(using: .png, properties: [:])!
    .write(to: root.appendingPathComponent(rel))
print("Home-screen icon: \(rel) (\(size) px)")
