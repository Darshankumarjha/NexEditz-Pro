
export interface Adjustments {
  // Light
  brightness: number; // 0-200
  contrast: number;   // 0-200
  exposure: number;   // 0-200
  highlights: number; // 0-200
  shadows: number;    // 0-200
  
  // Color
  saturation: number; // 0-200
  vibrance: number;   // 0-200
  temperature: number; // -100 to 100
  tint: number;        // -100 to 100
  hueRotate: number;  // 0-360
  sepia: number;      // 0-100
  
  // Details
  sharpness: number;  // 0-100
  blur: number;       // 0-20
  vignette: number;   // 0-100
}

export interface TextLayer {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  opacity: number;
  shadow: number;
  rotation: number;
  fontWeight: string;
  glowColor: string;
  glowBlur: number;
}

export enum ToolType {
  NONE = 'NONE',
  MOVE = 'MOVE',
  ADJUST = 'ADJUST',
  AI_EDIT = 'AI_EDIT',
  CROP = 'CROP',
  TEXT = 'TEXT',
  FILTERS = 'FILTERS',
  GENERATE = 'GENERATE'
}

export type AspectRatio = 'CUSTOM' | 'ORIGINAL' | '1:1' | '16:9' | '4:3' | '9:16' | '2:3';

export interface ImageLayer {
  id: string;
  file: File | null; // null if generated
  preview: string; // Base64
  name: string;
  width: number;
  height: number;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FilterPreset {
  id: string;
  name: string;
  adjustments: Partial<Adjustments>;
}

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 100,
  contrast: 100,
  exposure: 100,
  highlights: 100,
  shadows: 100,
  saturation: 100,
  vibrance: 100,
  temperature: 0,
  tint: 0,
  hueRotate: 0,
  sepia: 0,
  sharpness: 0,
  blur: 0,
  vignette: 0
};

export const PRESET_FILTERS: FilterPreset[] = [
  { id: 'normal', name: 'Original', adjustments: DEFAULT_ADJUSTMENTS },
  { id: 'vivid', name: 'Vivid', adjustments: { contrast: 130, saturation: 140, brightness: 110, vibrance: 120 } },
  { id: 'noir', name: 'Noir', adjustments: { saturation: 0, contrast: 140, brightness: 90, vignette: 40 } },
  { id: 'vintage', name: 'Vintage', adjustments: { sepia: 50, contrast: 90, brightness: 110, temperature: 30, vignette: 30 } },
  { id: 'cyber', name: 'Cyberpunk', adjustments: { contrast: 130, saturation: 150, temperature: -20, tint: 30, hueRotate: -10 } },
  { id: 'warm', name: 'Golden', adjustments: { temperature: 40, saturation: 120, brightness: 105, highlights: 90 } },
  { id: 'dramatic', name: 'Drama', adjustments: { contrast: 150, saturation: 110, shadows: 80, highlights: 120, sharpness: 20 } },
];

export const FONTS = [
  { name: 'Standard', value: 'Inter' },
  { name: 'Sci-Fi', value: 'Orbitron' },
  { name: 'Elegant', value: 'Playfair Display' },
  { name: 'Cursive', value: 'Dancing Script' },
  { name: 'Comic', value: 'Bangers' },
  { name: 'Medieval', value: 'Cinzel' },
];

export const ALLOWED_PASSWORDS = [
  "Darshan", "NCERT", "CBSCE", "Govind", "Anshika", "Anshuman", "Satyam", 
  "Artash", "Maskan", "Mansi", "Sajid", "Sifat", "Warqua", "Prabin", 
  "Hamid", "Jawid", "Dipti", "Ankit", "Akhilesh", "Gopal", "Lalla", 
  "Chess", "Cricket", "Password"
];