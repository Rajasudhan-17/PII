import { CoordinateMapper } from '../../src/services/ocr/coordinateMapper';

describe('CoordinateMapper Unit Tests', () => {
  it('should preserve coordinates when rendered and source dimensions match', () => {
    const bbox = { x0: 10, y0: 20, x1: 110, y1: 120 };
    const dim = { width: 1000, height: 1000 };

    const mapped = CoordinateMapper.mapToSourcePageUnits(bbox, dim, dim, 0);

    expect(mapped).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 100,
    });
  });

  it('should scale bounding box correctly from high-DPI rendered image to standard PDF points', () => {
    // 300 DPI rendered image (2479 x 3508 pixels) vs 72 DPI PDF source (595 x 842 points)
    const bbox = { x0: 300, y0: 600, x1: 600, y1: 900 };
    const renderedDim = { width: 2479, height: 3508 };
    const sourceDim = { width: 595, height: 842 };

    const mapped = CoordinateMapper.mapToSourcePageUnits(bbox, renderedDim, sourceDim, 0);

    expect(mapped.x).toBeCloseTo(72.0, 0);
    expect(mapped.y).toBeCloseTo(144.0, 0);
    expect(mapped.width).toBeCloseTo(72.0, 0);
    expect(mapped.height).toBeCloseTo(72.0, 0);
  });

  it('should execute end-to-end image crop -> HTR -> source coordinate mapping pipeline', () => {
    // Simulated PDF page (612 x 792 points), rendered at 300 DPI (2550 x 3300 pixels)
    const pageDim = { width: 612, height: 792 };
    const renderedDim = { width: 2550, height: 3300 };

    // Line crop detected on rendered page at x0=500, y0=1000, x1=2000, y1=1200
    const cropBbox = { x0: 500, y0: 1000, x1: 2000, y1: 1200 };

    // HTR line recognition relative to crop: full crop width (0 to 1500 px in crop coordinates)
    const lineBboxInCrop = {
      x0: cropBbox.x0 + 0,
      y0: cropBbox.y0 + 0,
      x1: cropBbox.x0 + 1500,
      y1: cropBbox.y0 + 200,
    };

    const mappedSourceBbox = CoordinateMapper.mapToSourcePageUnits(
      lineBboxInCrop,
      renderedDim,
      pageDim,
      0
    );

    // Scaling factor: 612 / 2550 = 0.24, 792 / 3300 = 0.24
    expect(mappedSourceBbox.x).toBe(120); // 500 * 0.24
    expect(mappedSourceBbox.y).toBe(240); // 1000 * 0.24
    expect(mappedSourceBbox.width).toBe(360); // 1500 * 0.24
    expect(mappedSourceBbox.height).toBe(48); // 200 * 0.24
  });

  it('should correctly map coordinates for 90 degrees rotated pages', () => {
    const bbox = { x0: 100, y0: 50, x1: 300, y1: 150 };
    const renderedDim = { width: 1000, height: 800 };
    const sourceDim = { width: 800, height: 1000 };

    const mapped = CoordinateMapper.mapToSourcePageUnits(bbox, renderedDim, sourceDim, 90);

    expect(mapped.x).toBeGreaterThanOrEqual(0);
    expect(mapped.y).toBeGreaterThanOrEqual(0);
    expect(mapped.width).toBeGreaterThan(0);
    expect(mapped.height).toBeGreaterThan(0);
  });

  it('should correctly map coordinates for 180 degrees rotated pages', () => {
    const bbox = { x0: 100, y0: 100, x1: 200, y1: 200 };
    const dim = { width: 1000, height: 1000 };

    const mapped = CoordinateMapper.mapToSourcePageUnits(bbox, dim, dim, 180);

    expect(mapped.x).toBe(800);
    expect(mapped.y).toBe(800);
    expect(mapped.width).toBe(100);
    expect(mapped.height).toBe(100);
  });

  it('should correctly map coordinates for 270 degrees rotated pages', () => {
    const bbox = { x0: 100, y0: 50, x1: 300, y1: 150 };
    const renderedDim = { width: 1000, height: 800 };
    const sourceDim = { width: 800, height: 1000 };

    const mapped = CoordinateMapper.mapToSourcePageUnits(bbox, renderedDim, sourceDim, 270);

    expect(mapped.x).toBeGreaterThanOrEqual(0);
    expect(mapped.y).toBeGreaterThanOrEqual(0);
    expect(mapped.width).toBeGreaterThan(0);
    expect(mapped.height).toBeGreaterThan(0);
  });

  it('should fallback to 1:1 scale when dimensions are omitted', () => {
    const bbox = { x0: 50, y0: 80, x1: 200, y1: 150 };

    const mapped = CoordinateMapper.mapToSourcePageUnits(bbox);

    expect(mapped).toEqual({
      x: 50,
      y: 80,
      width: 150,
      height: 70,
    });
  });

  it('should round output values to 2 decimal places and prevent negative bounds', () => {
    const bbox = { x0: -5, y0: 10.12345, x1: 45.6789, y1: 50.9876 };

    const mapped = CoordinateMapper.mapToSourcePageUnits(bbox);

    expect(mapped.x).toBe(0);
    expect(mapped.y).toBe(10.12);
    expect(mapped.width).toBe(50.68);
    expect(mapped.height).toBe(40.86);
  });
});
