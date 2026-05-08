import './styles.css';
import { Blueprint3d } from './blueprint3d';
import { floorplannerModes } from './floorplanner/floorplanner_view';
import { LegacyJSONLoader } from './three/legacy-json-loader';
import {
  Configuration,
  configDimUnit,
  configWallHeight,
  configWallThickness,
} from './core/configuration';
import {
  Dimensioning,
  dimInch,
  dimMeter,
  dimCentiMeter,
  dimMilliMeter,
} from './core/dimensioning';

// Expose on window for example.js compatibility
(window as any).BP3D = {
  Blueprint3d,
  floorplannerModes,
  // Legacy nested namespace expected by example.js
  Floorplanner: { floorplannerModes },
  LegacyJSONLoader,
  Configuration,
  configDimUnit,
  configWallHeight,
  configWallThickness,
  Dimensioning,
  dimInch,
  dimMeter,
  dimCentiMeter,
  dimMilliMeter,
};
