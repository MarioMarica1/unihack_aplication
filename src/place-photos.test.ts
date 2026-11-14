import { describe, expect, it } from 'vitest';
import { getSatelliteTilePreview, scoreWikimediaCandidate } from './place-photos';

describe('place-photos', () => {
  it('computes accurate Esri World Imagery zoom-18 tile coordinates for Timișoara Piața Victoriei', () => {
    const preview = getSatelliteTilePreview(45.75372, 21.22571, 18);
    // At zoom 18, n = 262144: lon 21.22571 -> x = 146528, lat 45.75372 -> y = 93518
    expect(preview.zoom).toBe(18);
    expect(preview.x).toBe(146528);
    expect(preview.y).toBe(93518);
    expect(preview.tileUrl).toBe(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/18/93518/146528'
    );
    expect(preview.fracX).toBeGreaterThan(0);
    expect(preview.fracX).toBeLessThan(100);
    expect(preview.fracY).toBeGreaterThan(0);
    expect(preview.fracY).toBeLessThan(100);
  });

  it('clamps extreme zoom levels and latitudes cleanly without producing NaN', () => {
    const clamped = getSatelliteTilePreview(89.9, 179.9, 99);
    expect(clamped.zoom).toBe(19);
    expect(Number.isFinite(clamped.x)).toBe(true);
    expect(Number.isFinite(clamped.y)).toBe(true);
    expect(clamped.fracX).toBeGreaterThanOrEqual(4);
    expect(clamped.fracY).toBeGreaterThanOrEqual(4);
  });

  it('scores matching Wikimedia Commons filenames above generic or unrelated files', () => {
    const exactMatch = scoreWikimediaCandidate(
      'File:Catedrala Mitropolitană din Timișoara - vedere frontală.jpg',
      'Catedrala Mitropolitană'
    );
    const unrelatedMap = scoreWikimediaCandidate(
      'File:Timisoara street map diagram svg.png',
      'Catedrala Mitropolitană'
    );
    const unrelatedShop = scoreWikimediaCandidate(
      'File:Castelul Huniade.jpg',
      'Farmacia Dona'
    );

    expect(exactMatch).toBeGreaterThanOrEqual(8);
    expect(unrelatedMap).toBeLessThan(0);
    expect(unrelatedShop).toBe(0);
  });
});
