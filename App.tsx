import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Upload, Download, Sliders, Undo2, Redo2, 
  Eraser, Sun, Layers, Sparkles, Loader2, Lock, Unlock, 
  Crop, Monitor, Smartphone, Square, LayoutTemplate,
  Trash2, Plus, BrainCircuit, ScanEye, X, Type,
  ZoomIn, ZoomOut, Maximize, ImagePlus, User, Cloud, Wand2, Palette, Move,
  Home, Play, CheckCircle2, ChevronRight, Lightbulb
} from 'lucide-react';
import { Icon } from './components/Icon';
import { Slider } from './components/Slider';
import { editImageWithGemini, suggestEditsWithGemini, generateImageWithGemini } from './services/geminiService';
import { 
  Adjustments, DEFAULT_ADJUSTMENTS, ToolType, AspectRatio, 
  ImageLayer, PRESET_FILTERS, TextLayer, CropRect, FONTS, ALLOWED_PASSWORDS
} from './types';

// --- Theme Constants ---
const THEME = {
  bg: "bg-[#050505]",
  panel: "bg-[#121212]/95 backdrop-blur-xl border-t md:border-t-0 md:border-l border-white/10",
  activeItem: "text-blue-500 border-t-2 border-blue-500 bg-white/5",
  glass: "bg-white/5 border border-white/10 backdrop-blur-md"
};
const WATERMARK_CODE = "QWERTY";

const App: React.FC = () => {
  // --- Core State ---
  const [gallery, setGallery] = useState<ImageLayer[]>([]);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  
  // Editing State
  const [adjustments, setAdjustments] = useState<Adjustments>(DEFAULT_ADJUSTMENTS);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [textLayers, setTextLayers] = useState<TextLayer[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  
  // Workspace State
  const [activeTool, setActiveTool] = useState<ToolType>(ToolType.NONE);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  // Text Dragging
  const [draggingTextId, setDraggingTextId] = useState<string | null>(null);
  const [textDragOffset, setTextDragOffset] = useState({ x: 0, y: 0 });

  // Crop State
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [cropDragMode, setCropDragMode] = useState<'move' | 'nw' | 'ne' | 'sw' | 'se' | null>(null);
  
  // AI & Logic State
  const [isProcessing, setIsProcessing] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [genAspectRatio, setGenAspectRatio] = useState<string>("1:1");
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  
  // New State for "GO" flow and Export
  const [showStartMenu, setShowStartMenu] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportCodeInput, setExportCodeInput] = useState("");
  const [isExportUnlocked, setIsExportUnlocked] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Derived
  const activeImage = gallery.find(img => img.id === activeImageId);

  // --- Initialization & History ---
  useEffect(() => {
    if (activeImage) {
      const img = new Image();
      img.src = activeImage.preview;
      img.onload = () => {
        setHistory([activeImage.preview]);
        setHistoryIndex(0);
        setAdjustments(DEFAULT_ADJUSTMENTS);
        setPrompt("");
        setTextLayers([]);
        // Fit to screen
        if (containerRef.current) {
          const cw = containerRef.current.clientWidth;
          const ch = containerRef.current.clientHeight;
          const scale = Math.min((cw - 40) / img.width, (ch - 40) / img.height);
          setZoom(Math.min(scale, 1));
          setPan({ x: 0, y: 0 });
        }
      };
    }
  }, [activeImage?.id]);

  const updateHistory = (newImage: string) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newImage);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setGallery(prev => prev.map(img => img.id === activeImageId ? { ...img, preview: newImage } : img));
  };

  const handleUndo = () => historyIndex > 0 && setHistoryIndex(historyIndex - 1);
  const handleRedo = () => historyIndex < history.length - 1 && setHistoryIndex(historyIndex + 1);

  // --- Rendering Engine ---
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeImage || history.length === 0) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.src = history[historyIndex];
    img.crossOrigin = "anonymous";
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;

      // 1. Draw Image
      ctx.drawImage(img, 0, 0);

      // 2. Apply Filters (Visual)
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tCtx = tempCanvas.getContext('2d');
      if (!tCtx) return;

      const filterString = `
        brightness(${adjustments.brightness}%) 
        contrast(${adjustments.contrast}%) 
        saturate(${adjustments.saturation}%) 
        blur(${adjustments.blur}px) 
        sepia(${adjustments.sepia}%) 
        hue-rotate(${adjustments.hueRotate}deg)
      `;
      tCtx.filter = filterString.trim();
      tCtx.drawImage(canvas, 0, 0);
      
      ctx.clearRect(0,0, canvas.width, canvas.height);
      ctx.drawImage(tempCanvas, 0, 0);

      // 3. Overlays
      if (adjustments.temperature !== 0) {
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = adjustments.temperature > 0 
          ? `rgba(255, 140, 0, ${adjustments.temperature / 200})` 
          : `rgba(0, 100, 255, ${Math.abs(adjustments.temperature) / 200})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'source-over';
      }
      if (adjustments.vignette > 0) {
        const gradient = ctx.createRadialGradient(
          canvas.width / 2, canvas.height / 2, canvas.width * 0.3,
          canvas.width / 2, canvas.height / 2, canvas.width * 0.9
        );
        gradient.addColorStop(0, "rgba(0,0,0,0)");
        gradient.addColorStop(1, `rgba(0,0,0,${adjustments.vignette / 100})`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    };
  }, [activeImage, history, historyIndex, adjustments]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // --- Interaction Logic (Pan/Zoom) ---
  const handlePointerDown = (e: React.PointerEvent) => {
    // If cropping, or dragging text, don't pan canvas
    if (activeTool === ToolType.CROP || activeTool === ToolType.TEXT) return;
    
    setIsDraggingCanvas(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDraggingCanvas) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  // --- Text Dragging Logic ---
  const handleTextPointerDown = (e: React.PointerEvent, layerId: string) => {
    e.stopPropagation(); // Stop canvas drag
    if (activeTool !== ToolType.TEXT) return;
    
    const layer = textLayers.find(l => l.id === layerId);
    if (!layer) return;

    setSelectedTextId(layerId);
    setDraggingTextId(layerId);
    
    // We need to calculate offset relative to current screen position of the text
    // ScreenX = CanvasX * Zoom + PanX
    // CanvasX = (ScreenX - PanX) / Zoom
    const mouseCanvasX = (e.clientX - (containerRef.current?.getBoundingClientRect().left || 0) - pan.x) / zoom;
    const mouseCanvasY = (e.clientY - (containerRef.current?.getBoundingClientRect().top || 0) - pan.y) / zoom;
    
    setTextDragOffset({
      x: mouseCanvasX - layer.x,
      y: mouseCanvasY - layer.y
    });
  };

  const handleTextPointerMove = (e: React.PointerEvent) => {
    if (draggingTextId && activeTool === ToolType.TEXT) {
      const mouseCanvasX = (e.clientX - (containerRef.current?.getBoundingClientRect().left || 0) - pan.x) / zoom;
      const mouseCanvasY = (e.clientY - (containerRef.current?.getBoundingClientRect().top || 0) - pan.y) / zoom;
      
      setTextLayers(layers => layers.map(l => 
        l.id === draggingTextId 
          ? { ...l, x: mouseCanvasX - textDragOffset.x, y: mouseCanvasY - textDragOffset.y }
          : l
      ));
    }
  };

  const handleTextPointerUp = () => {
    setDraggingTextId(null);
  };

  // --- Crop Logic ---
  const initCrop = () => {
    if (!canvasRef.current) return;
    // Reset Zoom for easier cropping
    if (containerRef.current) {
      const w = canvasRef.current.width;
      const h = canvasRef.current.height;
      const cw = containerRef.current.clientWidth;
      const ch = containerRef.current.clientHeight;
      const scale = Math.min((cw - 40) / w, (ch - 40) / h);
      setZoom(Math.min(scale, 1));
      setPan({ x: 0, y: 0 });
    }
    
    const w = canvasRef.current.width;
    const h = canvasRef.current.height;
    setCropRect({ x: w * 0.1, y: h * 0.1, width: w * 0.8, height: h * 0.8 });
    setIsCropping(true);
    setActiveTool(ToolType.CROP);
  };

  const applyCrop = () => {
    if (!canvasRef.current || !cropRect) return;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cropRect.width;
    tempCanvas.height = cropRect.height;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return;

    // The canvasRef already has the filters rendered onto it by renderCanvas loop
    ctx.drawImage(canvasRef.current, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 0, 0, cropRect.width, cropRect.height);
    
    updateHistory(tempCanvas.toDataURL());
    setIsCropping(false);
    setCropRect(null);
    setActiveTool(ToolType.NONE);
    // Filters are baked in, reset them
    setAdjustments(DEFAULT_ADJUSTMENTS);
  };

  const handleCropDragStart = (e: React.PointerEvent, mode: 'move' | 'nw' | 'ne' | 'sw' | 'se') => {
    e.stopPropagation();
    e.preventDefault();
    setCropDragMode(mode);
    const startX = e.clientX;
    const startY = e.clientY;
    const startRect = { ...cropRect! };

    const onMove = (mv: PointerEvent) => {
      if (!canvasRef.current) return;
      const dx = (mv.clientX - startX) / zoom; // Adjust for zoom
      const dy = (mv.clientY - startY) / zoom;
      
      let newRect = { ...startRect };
      
      if (mode === 'move') {
        newRect.x += dx;
        newRect.y += dy;
      } else if (mode === 'se') {
        newRect.width += dx;
        newRect.height += dy;
      } else if (mode === 'sw') {
        newRect.x += dx;
        newRect.width -= dx;
        newRect.height += dy;
      } else if (mode === 'ne') {
        newRect.y += dy;
        newRect.width += dx;
        newRect.height -= dy;
      } else if (mode === 'nw') {
        newRect.x += dx;
        newRect.y += dy;
        newRect.width -= dx;
        newRect.height -= dy;
      }
      
      // Constraints
      if (newRect.width < 50) newRect.width = 50;
      if (newRect.height < 50) newRect.height = 50;
      
      setCropRect(newRect);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setCropDragMode(null);
    };
    
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // --- Password System ---
  const triggerSecureAction = (action: () => void) => {
    setPendingAction(() => action);
    setShowPasswordModal(true);
  };

  const checkPassword = () => {
    if (ALLOWED_PASSWORDS.includes(passwordInput)) {
      setShowPasswordModal(false);
      setPasswordInput("");
      if (pendingAction) {
        pendingAction();
        setPendingAction(null);
      }
    } else {
      const el = document.getElementById('pass-input');
      el?.classList.add('animate-shake');
      setTimeout(() => el?.classList.remove('animate-shake'), 500);
    }
  };

  // --- Gemini Integration ---
  const runAIEdit = (promptText: string) => {
    if (!canvasRef.current) return;
    triggerSecureAction(async () => {
      setIsProcessing(true);
      try {
        const currentData = canvasRef.current!.toDataURL('image/png');
        const res = await editImageWithGemini(currentData, promptText);
        updateHistory(res);
        setAdjustments(DEFAULT_ADJUSTMENTS);
      } catch (e) {
        alert("AI Error: " + e);
      } finally {
        setIsProcessing(false);
      }
    });
  };

  const handleSuggestions = async () => {
    if (!canvasRef.current) return;
    setIsSuggesting(true);
    try {
      const currentData = canvasRef.current.toDataURL('image/png');
      const suggestions = await suggestEditsWithGemini(currentData);
      setAiSuggestions(suggestions);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSuggesting(false);
    }
  };

  const runAIGeneration = () => {
    if (!prompt) return;
    triggerSecureAction(async () => {
      setIsProcessing(true);
      try {
        const res = await generateImageWithGemini(prompt, genAspectRatio);
        const img = new Image();
        img.src = res;
        img.onload = () => {
           const newId = Date.now().toString();
           setGallery(prev => [...prev, { id: newId, file: null, preview: res, name: `Gen ${newId}`, width: img.width, height: img.height }]);
           setActiveImageId(newId);
           setActiveTool(ToolType.NONE);
        };
      } catch (e) {
        alert("Generation Error: " + e);
      } finally {
        setIsProcessing(false);
      }
    });
  };

  // --- File I/O ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setShowStartMenu(false);
    if (e.target.files) {
      Array.from(e.target.files).forEach((file: File) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const result = ev.target?.result as string;
          const img = new Image();
          img.src = result;
          img.onload = () => {
            const newId = Math.random().toString(36).substring(2, 9);
            setGallery(prev => [...prev, { id: newId, file, preview: result, name: file.name, width: img.width, height: img.height }]);
            if (!activeImageId) setActiveImageId(newId);
          };
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const executeDownload = (withWatermark: boolean) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    
    // Create export canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return;

    // Draw main image (which has filters already)
    ctx.drawImage(canvas, 0, 0);

    // Draw Text Layers
    textLayers.forEach(layer => {
      ctx.save();
      ctx.translate(layer.x, layer.y);
      ctx.rotate((layer.rotation * Math.PI) / 180);
      if (layer.glowBlur > 0) {
        ctx.shadowBlur = layer.glowBlur;
        ctx.shadowColor = layer.glowColor;
      }
      ctx.font = `${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`;
      ctx.fillStyle = layer.color;
      ctx.fillText(layer.text, 0, 0);
      ctx.restore();
    });

    // Draw Watermark
    if (withWatermark) {
      ctx.save();
      const wmSize = Math.max(24, canvas.width * 0.04);
      ctx.font = `bold ${wmSize}px Orbitron`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 4;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText("Darshan", canvas.width - 20, canvas.height - 20);
      ctx.restore();
    }

    const link = document.createElement('a');
    link.download = `NexEditz_Pro_${Date.now()}.png`;
    link.href = tempCanvas.toDataURL('image/png', 1.0);
    link.click();
    
    setShowExportModal(false);
    setIsExportUnlocked(false);
    setExportCodeInput("");
  };

  const handleExportUnlock = () => {
    if (exportCodeInput === WATERMARK_CODE) {
      setIsExportUnlocked(true);
      executeDownload(false); // Immediate download after unlock
    } else {
      alert("Invalid Code");
    }
  };

  // --- UI Components ---
  const renderPasswordModal = () => (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md">
       <div className="w-full max-w-sm bg-[#111] border border-white/20 p-8 rounded-2xl flex flex-col items-center gap-6 animate-in zoom-in duration-200">
          <Icon icon={Lock} size={40} className="text-blue-500 animate-pulse" />
          <h2 className="text-2xl font-orbitron font-bold">SECURITY CHECK</h2>
          <input 
            id="pass-input" type="password" value={passwordInput} autoFocus
            onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && checkPassword()}
            placeholder="Enter Password"
            className="w-full bg-black/50 border border-white/20 p-3 text-center rounded-xl text-white outline-none focus:border-blue-500 text-lg"
          />
          <div className="flex gap-4 w-full">
            <button onClick={() => { setShowPasswordModal(false); setPendingAction(null); }} className="flex-1 py-3 bg-gray-800 rounded-xl">Cancel</button>
            <button onClick={checkPassword} className="flex-1 py-3 bg-blue-600 rounded-xl font-bold">Unlock</button>
          </div>
       </div>
    </div>
  );

  const renderExportModal = () => (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md">
       <div className="w-full max-w-md bg-[#111] border border-white/20 p-6 rounded-2xl flex flex-col gap-6 animate-in zoom-in duration-200">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-orbitron font-bold">EXPORT OPTIONS</h2>
            <button onClick={() => setShowExportModal(false)}><Icon icon={X} /></button>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
             <button onClick={() => executeDownload(true)} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all group">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center"><Icon icon={Download} size={20} /></div>
                   <div className="text-left">
                     <div className="font-bold">Download Free</div>
                     <div className="text-xs text-gray-400">Includes 'Darshan' Watermark</div>
                   </div>
                </div>
                <Icon icon={ChevronRight} className="text-gray-500 group-hover:text-white" />
             </button>

             <div className="p-4 bg-blue-900/10 border border-blue-500/30 rounded-xl space-y-3">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center"><Icon icon={Sparkles} size={20} /></div>
                   <div className="text-left">
                     <div className="font-bold text-blue-400">Remove Watermark</div>
                     <div className="text-xs text-gray-400">Enter code to unlock</div>
                   </div>
                </div>
                <div className="flex gap-2">
                   <input 
                     type="text" 
                     placeholder="Enter Code" 
                     value={exportCodeInput}
                     onChange={(e) => setExportCodeInput(e.target.value)}
                     className="flex-1 bg-black/50 border border-white/20 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                   />
                   <button onClick={handleExportUnlock} className="px-4 py-2 bg-blue-600 rounded-lg text-sm font-bold">UNLOCK</button>
                </div>
             </div>
          </div>
       </div>
    </div>
  );

  // --- Landing Screen ---
  if (gallery.length === 0) {
    return (
      <div className="h-screen w-full bg-[#050505] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
         {showPasswordModal && renderPasswordModal()}
         <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,#1a1c2e_0%,#000000_100%)] opacity-50"></div>
         
         <div className="relative z-10 text-center space-y-6 max-w-xl flex flex-col items-center">
            <h1 className="text-6xl md:text-8xl font-black font-orbitron bg-clip-text text-transparent bg-gradient-to-b from-white to-gray-600 animate-float">
              NEX<span className="text-blue-500">EDITZ</span>
            </h1>
            <p className="text-sm text-blue-400 font-mono tracking-widest uppercase">PRO • Made by Darshan Kumar Jha</p>
            
            {!showStartMenu ? (
              <button 
                onClick={() => setShowStartMenu(true)}
                className="w-32 h-32 rounded-full bg-blue-600 hover:bg-blue-500 shadow-[0_0_40px_rgba(0,100,255,0.5)] hover:shadow-[0_0_60px_rgba(0,100,255,0.8)] transition-all flex items-center justify-center group animate-pulse-fast"
              >
                 <span className="font-orbitron font-bold text-3xl group-hover:scale-110 transition-transform">GO</span>
              </button>
            ) : (
              <div className="flex flex-col gap-4 w-full animate-in slide-in-from-bottom duration-300">
                 <button 
                   onClick={() => fileInputRef.current?.click()}
                   className="w-full py-4 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl font-bold text-lg flex items-center justify-center gap-2 backdrop-blur-md"
                 >
                   <Icon icon={Upload} size={24} /> UPLOAD PHOTO
                 </button>
                 <button 
                   onClick={() => {
                     triggerSecureAction(() => {
                        const newId = "gen-mode";
                        setGallery([{ id: newId, file: null, preview: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", name: "New Creation", width: 1000, height: 1000 }]);
                        setActiveImageId(newId);
                        setActiveTool(ToolType.GENERATE);
                     });
                   }}
                   className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl font-bold text-lg text-white hover:opacity-90 flex items-center justify-center gap-2 shadow-lg"
                 >
                   <Icon icon={Wand2} size={24} /> CREATE AI ART
                 </button>
                 <button onClick={() => setShowStartMenu(false)} className="text-sm text-gray-500 hover:text-white mt-2">CANCEL</button>
              </div>
            )}
            
            <input ref={fileInputRef} type="file" multiple accept="image/*" onChange={handleFileUpload} className="hidden" />
         </div>
      </div>
    );
  }

  // --- Main Editor UI ---
  return (
    <div className={`h-screen flex flex-col ${THEME.bg} text-white font-sans overflow-hidden`}
       onPointerMove={handleTextPointerMove}
       onPointerUp={handleTextPointerUp}
    >
      {showPasswordModal && renderPasswordModal()}
      {showExportModal && renderExportModal()}

      {/* Top Bar */}
      <header className="h-16 flex-shrink-0 border-b border-white/10 bg-black/40 backdrop-blur-lg flex items-center justify-between px-4 z-40">
        <div className="flex items-center gap-4">
           <button onClick={() => setGallery([])} className="p-2 hover:bg-white/10 rounded-full" title="Back to Home"><Icon icon={Home} /></button>
           <div className="flex flex-col">
             <span className="font-orbitron font-bold text-lg tracking-wider">NEX<span className="text-blue-500">EDITZ</span></span>
           </div>
        </div>
        
        <div className="flex items-center gap-2 md:gap-4">
           <div className="flex bg-white/5 rounded-lg border border-white/10 p-1">
             <button onClick={handleUndo} className="p-2 hover:bg-white/10 rounded"><Icon icon={Undo2} size={18}/></button>
             <button onClick={handleRedo} className="p-2 hover:bg-white/10 rounded"><Icon icon={Redo2} size={18}/></button>
           </div>
           
           <button onClick={() => galleryInputRef.current?.click()} className="p-2 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10">
             <Icon icon={ImagePlus} size={18} />
           </button>
           
           <button onClick={() => setShowExportModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-lg text-xs font-bold hover:bg-blue-500 transition-colors shadow-[0_0_15px_rgba(37,99,235,0.5)]">
             EXPORT <Icon icon={Download} size={16} />
           </button>
        </div>
      </header>

      {/* Workspace */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
         
         {/* Canvas Area */}
         <div 
           className="flex-1 relative bg-[#09090b] flex flex-col overflow-hidden"
           onPointerDown={handlePointerDown}
           onPointerMove={handlePointerMove}
           onPointerUp={() => setIsDraggingCanvas(false)}
           onWheel={(e) => {
             if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                setZoom(z => Math.max(0.1, Math.min(5, z - e.deltaY * 0.001)));
             }
           }}
         >
            <div ref={containerRef} className="flex-1 w-full h-full relative flex items-center justify-center overflow-hidden">
                <div 
                  style={{ 
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, 
                    transition: isDraggingCanvas ? 'none' : 'transform 0.1s ease-out' 
                  }}
                  className="relative shadow-2xl shadow-black origin-center"
                >
                   <canvas ref={canvasRef} className="block pointer-events-none" />
                   
                   {/* Interactive Text Layers */}
                   {textLayers.map(layer => (
                     <div
                        key={layer.id}
                        onPointerDown={(e) => handleTextPointerDown(e, layer.id)}
                        style={{
                          position: 'absolute',
                          left: layer.x,
                          top: layer.y,
                          transform: `translate(0, -100%) rotate(${layer.rotation}deg)`,
                          transformOrigin: 'bottom left',
                          fontFamily: layer.fontFamily,
                          fontSize: `${layer.fontSize}px`,
                          color: layer.color,
                          fontWeight: layer.fontWeight,
                          textShadow: layer.glowBlur > 0 ? `0 0 ${layer.glowBlur}px ${layer.glowColor}` : `0 2px ${layer.shadow}px black`,
                          cursor: activeTool === ToolType.TEXT ? 'move' : 'default',
                          border: selectedTextId === layer.id && activeTool === ToolType.TEXT ? '2px dashed #00f3ff' : 'none',
                          whiteSpace: 'nowrap',
                          pointerEvents: activeTool === ToolType.TEXT ? 'auto' : 'none',
                          zIndex: 20,
                          userSelect: 'none'
                        }}
                     >
                       {layer.text}
                     </div>
                   ))}

                   {/* Crop Overlay */}
                   {isCropping && cropRect && (
                     <>
                        <div className="absolute inset-0 bg-black/60 z-30"></div>
                        <div 
                          style={{
                            position: 'absolute',
                            left: cropRect.x,
                            top: cropRect.y,
                            width: cropRect.width,
                            height: cropRect.height,
                          }}
                          className="z-40 crop-dash cursor-move shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
                          onPointerDown={(e) => handleCropDragStart(e, 'move')}
                        >
                           {['nw', 'ne', 'sw', 'se'].map((h) => (
                             <div 
                               key={h}
                               onPointerDown={(e) => handleCropDragStart(e, h as any)}
                               className={`absolute w-6 h-6 bg-blue-500 border-2 border-white rounded-full z-50 
                                 ${h === 'nw' ? '-top-3 -left-3 cursor-nw-resize' : ''}
                                 ${h === 'ne' ? '-top-3 -right-3 cursor-ne-resize' : ''}
                                 ${h === 'sw' ? '-bottom-3 -left-3 cursor-sw-resize' : ''}
                                 ${h === 'se' ? '-bottom-3 -right-3 cursor-se-resize' : ''}
                               `}
                             />
                           ))}
                           <div className="w-full h-full grid grid-cols-3 grid-rows-3 pointer-events-none">
                             {[...Array(9)].map((_, i) => <div key={i} className="border border-white/20"></div>)}
                           </div>
                        </div>
                     </>
                   )}
                </div>
            </div>

            {/* Floating Zoom Controls */}
            <div className="absolute top-4 right-4 flex flex-col gap-2 z-30">
              <button onClick={() => setZoom(z => Math.min(5, z + 0.2))} className="p-2 bg-black/50 backdrop-blur text-white rounded-lg border border-white/10 hover:bg-blue-600 transition-colors"><Icon icon={ZoomIn} /></button>
              <button onClick={() => setZoom(z => Math.max(0.1, z - 0.2))} className="p-2 bg-black/50 backdrop-blur text-white rounded-lg border border-white/10 hover:bg-blue-600 transition-colors"><Icon icon={ZoomOut} /></button>
              <button onClick={() => { setZoom(1); setPan({x:0,y:0}); }} className="p-2 bg-black/50 backdrop-blur text-white rounded-lg border border-white/10 hover:bg-blue-600 transition-colors"><Icon icon={Maximize} /></button>
            </div>

            {/* Bottom Toolbar */}
            <div className="h-20 bg-black border-t border-white/10 flex items-center justify-center px-2 gap-1 md:gap-4 overflow-x-auto no-scrollbar z-50">
               {[
                 { id: ToolType.GENERATE, icon: Wand2, label: 'Create' },
                 { id: ToolType.CROP, icon: Crop, label: 'Crop' },
                 { id: ToolType.FILTERS, icon: Palette, label: 'Filters' },
                 { id: ToolType.ADJUST, icon: Sliders, label: 'Adjust' },
                 { id: ToolType.TEXT, icon: Type, label: 'Text' },
                 { id: ToolType.AI_EDIT, icon: BrainCircuit, label: 'AI Magic' },
               ].map(tool => (
                 <button
                   key={tool.id}
                   onClick={() => setActiveTool(activeTool === tool.id ? ToolType.NONE : tool.id)}
                   className={`flex flex-col items-center justify-center min-w-[70px] h-full gap-1 transition-all ${activeTool === tool.id ? THEME.activeItem : 'text-gray-400 hover:text-white'}`}
                 >
                   <Icon icon={tool.icon} size={22} className={activeTool === tool.id ? 'animate-bounce' : ''} />
                   <span className="text-[10px] uppercase font-bold tracking-wider">{tool.label}</span>
                 </button>
               ))}
            </div>
         </div>

         {/* Right Properties Panel (Desktop) / Bottom Sheet (Mobile) */}
         {activeTool !== ToolType.NONE && (
           <div className="absolute bottom-20 md:static left-0 right-0 md:w-80 h-[55vh] md:h-full bg-[#121212]/95 backdrop-blur-xl border-t md:border-t-0 md:border-l border-white/10 flex flex-col z-50 shadow-2xl animate-in slide-in-from-bottom duration-300">
              
              <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/20">
                <span className="font-bold text-blue-400 uppercase tracking-widest">{activeTool.replace('_', ' ')}</span>
                <button onClick={() => setActiveTool(ToolType.NONE)}><Icon icon={X} size={18} /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                 
                 {/* GENERATE */}
                 {activeTool === ToolType.GENERATE && (
                   <div className="space-y-4">
                     <p className="text-xs text-gray-400">Create new images from scratch using Gemini AI.</p>
                     <textarea 
                       value={prompt} onChange={(e) => setPrompt(e.target.value)}
                       placeholder="A futuristic city with flying cars..."
                       className="w-full bg-black/50 border border-white/20 rounded-xl p-3 text-sm focus:border-blue-500 outline-none h-28 resize-none"
                     />
                     <div className="grid grid-cols-3 gap-2">
                       {['1:1', '16:9', '9:16'].map(r => (
                         <button key={r} onClick={() => setGenAspectRatio(r)} className={`py-2 border rounded-lg text-xs ${genAspectRatio === r ? 'border-blue-500 bg-blue-500/20' : 'border-white/10 bg-white/5'}`}>{r}</button>
                       ))}
                     </div>
                     <button onClick={runAIGeneration} disabled={isProcessing} className="w-full py-4 bg-gradient-to-r from-pink-600 to-purple-600 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg hover:shadow-purple-500/30 transition-shadow">
                       {isProcessing ? <Icon icon={Loader2} className="animate-spin" /> : <><Icon icon={Sparkles} /> GENERATE</>}
                     </button>
                   </div>
                 )}

                 {/* CROP */}
                 {activeTool === ToolType.CROP && (
                   <div className="space-y-4">
                     <div className="grid grid-cols-2 gap-2">
                        {['CUSTOM', '1:1', '16:9', '4:3', '9:16'].map(r => (
                          <button 
                            key={r}
                            onClick={() => {
                              if (!canvasRef.current) return;
                              const w = canvasRef.current.width;
                              const h = canvasRef.current.height;
                              let nw = w * 0.8, nh = h * 0.8;
                              if (r === '1:1') { nw = Math.min(w,h)*0.8; nh=nw; }
                              if (r === '16:9') { nw = w*0.8; nh=nw*(9/16); }
                              if (r === '9:16') { nh = h*0.8; nw=nh*(9/16); }
                              setCropRect({ x: (w-nw)/2, y: (h-nh)/2, width: nw, height: nh });
                              setIsCropping(true);
                            }}
                            className="py-3 bg-white/5 border border-white/10 rounded-lg text-xs font-bold hover:bg-white/10"
                          >
                            {r}
                          </button>
                        ))}
                     </div>
                     {!isCropping ? (
                        <button onClick={initCrop} className="w-full py-3 bg-blue-600 rounded-xl font-bold">ACTIVATE CROP</button>
                     ) : (
                        <div className="flex gap-2 pt-4">
                           <button onClick={() => { setIsCropping(false); setCropRect(null); }} className="flex-1 py-3 bg-gray-700 rounded-xl">Cancel</button>
                           <button onClick={applyCrop} className="flex-1 py-3 bg-blue-600 rounded-xl font-bold">APPLY</button>
                        </div>
                     )}
                   </div>
                 )}

                 {/* TEXT */}
                 {activeTool === ToolType.TEXT && (
                   <div className="space-y-5">
                      <button onClick={() => {
                         if (!canvasRef.current) return;
                         const id = Date.now().toString();
                         const imgCX = canvasRef.current.width / 2;
                         const imgCY = canvasRef.current.height / 2;

                         setTextLayers([...textLayers, { 
                           id, text: "EDIT ME", x: imgCX, y: imgCY, 
                           fontSize: 60, fontFamily: 'Orbitron', color: '#ffffff', 
                           opacity: 1, shadow: 0, rotation: 0, fontWeight: 'bold', 
                           glowBlur: 10, glowColor: '#00f3ff' 
                         }]);
                         setSelectedTextId(id);
                      }} className="w-full py-3 bg-white/10 border border-white/20 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-white/20">
                         <Icon icon={Plus} size={18} /> ADD NEW TEXT
                      </button>

                      {selectedTextId && (
                        <div className="space-y-4 animate-in slide-in-from-right">
                          <input 
                            value={textLayers.find(t => t.id === selectedTextId)?.text || ''}
                            onChange={(e) => setTextLayers(l => l.map(t => t.id === selectedTextId ? { ...t, text: e.target.value } : t))}
                            className="w-full bg-black/50 border-b-2 border-blue-500 p-2 text-white outline-none text-lg text-center font-bold"
                          />
                          
                          <div className="space-y-2">
                             <label className="text-[10px] text-gray-400">FONT STYLE</label>
                             <div className="grid grid-cols-3 gap-2">
                               {FONTS.map(f => (
                                 <button key={f.value} 
                                   onClick={() => setTextLayers(l => l.map(t => t.id === selectedTextId ? { ...t, fontFamily: f.value } : t))}
                                   className={`py-1 rounded text-[10px] ${textLayers.find(t => t.id === selectedTextId)?.fontFamily === f.value ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400'}`}
                                 >
                                   {f.name}
                                 </button>
                               ))}
                             </div>
                          </div>

                          <Slider label="Size" value={textLayers.find(t => t.id === selectedTextId)?.fontSize || 40} min={10} max={300} onChange={(v) => setTextLayers(l => l.map(t => t.id === selectedTextId ? { ...t, fontSize: v } : t))} />
                          <Slider label="Rotation" value={textLayers.find(t => t.id === selectedTextId)?.rotation || 0} min={-180} max={180} onChange={(v) => setTextLayers(l => l.map(t => t.id === selectedTextId ? { ...t, rotation: v } : t))} />
                          
                          <div className="space-y-2">
                             <label className="text-[10px] text-gray-400">GLOW COLOR</label>
                             <div className="flex gap-2 overflow-x-auto pb-2">
                               {['#00f3ff', '#ff00ff', '#bc13fe', '#ffe600', '#ff0000', '#ffffff', '#000000'].map(c => (
                                 <button key={c} onClick={() => setTextLayers(l => l.map(t => t.id === selectedTextId ? { ...t, glowColor: c } : t))} style={{background: c}} className="w-8 h-8 rounded-full border-2 border-white/10 hover:scale-110 transition-transform flex-shrink-0" />
                               ))}
                             </div>
                          </div>
                          <Slider label="Glow Intensity" value={textLayers.find(t => t.id === selectedTextId)?.glowBlur || 0} min={0} max={100} onChange={(v) => setTextLayers(l => l.map(t => t.id === selectedTextId ? { ...t, glowBlur: v } : t))} />
                          
                          <button 
                             onClick={() => {
                               setTextLayers(l => l.filter(t => t.id !== selectedTextId));
                               setSelectedTextId(null);
                             }}
                             className="w-full py-2 bg-red-900/50 text-red-400 rounded-lg text-xs font-bold flex items-center justify-center gap-2"
                          >
                             <Icon icon={Trash2} size={14} /> DELETE LAYER
                          </button>
                        </div>
                      )}
                   </div>
                 )}

                 {/* FILTERS & ADJUST */}
                 {activeTool === ToolType.FILTERS && (
                    <div className="grid grid-cols-2 gap-3">
                      {PRESET_FILTERS.map(f => (
                        <button key={f.id} onClick={() => setAdjustments(prev => ({...prev, ...f.adjustments}))} className="h-20 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex flex-col items-center justify-center gap-2 transition-all hover:border-blue-500">
                          <div className={`w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-black shadow-lg border border-white/20`} />
                          <span className="text-xs font-bold">{f.name}</span>
                        </button>
                      ))}
                    </div>
                 )}

                 {activeTool === ToolType.ADJUST && (
                    <div className="space-y-6">
                       <Slider label="Exposure" value={adjustments.exposure} min={0} max={200} onChange={(v) => setAdjustments(p => ({...p, exposure: v}))} />
                       <Slider label="Contrast" value={adjustments.contrast} min={0} max={200} onChange={(v) => setAdjustments(p => ({...p, contrast: v}))} />
                       <Slider label="Saturation" value={adjustments.saturation} min={0} max={200} onChange={(v) => setAdjustments(p => ({...p, saturation: v}))} />
                       <Slider label="Temp" value={adjustments.temperature} min={-100} max={100} onChange={(v) => setAdjustments(p => ({...p, temperature: v}))} />
                       <Slider label="Sharpen" value={adjustments.sharpness} min={0} max={100} onChange={(v) => setAdjustments(p => ({...p, sharpness: v}))} />
                    </div>
                 )}

                 {/* AI EDIT */}
                 {activeTool === ToolType.AI_EDIT && (
                   <div className="space-y-4">
                      <button onClick={handleSuggestions} className="w-full py-3 bg-gradient-to-r from-blue-900/50 to-purple-900/50 border border-blue-500/30 rounded-xl flex items-center justify-center gap-2 mb-2">
                        {isSuggesting ? <Icon icon={Loader2} className="animate-spin" /> : <><Icon icon={Lightbulb} className="text-yellow-400" /> Auto Suggest Edits</>}
                      </button>
                      
                      {aiSuggestions.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {aiSuggestions.map((s, i) => (
                            <button key={i} onClick={() => setPrompt(s)} className="text-xs bg-white/10 border border-white/10 px-3 py-1.5 rounded-full hover:bg-white/20 truncate max-w-full">
                              {s}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 mt-2">
                         {['Remove Background', 'Make it Cyberpunk', 'Fix Lighting', 'Remove People'].map(t => (
                           <button key={t} onClick={() => runAIEdit(t)} className="p-3 bg-white/5 border border-white/10 rounded-lg text-xs text-left hover:bg-white/10">{t}</button>
                         ))}
                      </div>
                      <textarea 
                        value={prompt} onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Describe changes..."
                        className="w-full bg-black/50 border border-white/20 rounded-xl p-3 text-sm h-24 mt-2"
                      />
                      <button onClick={() => runAIEdit(prompt)} disabled={!prompt || isProcessing} className="w-full py-4 bg-purple-600 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-purple-500 transition-colors shadow-lg shadow-purple-900/20">
                         {isProcessing ? <Icon icon={Loader2} className="animate-spin" /> : <><Icon icon={Sparkles} /> EXECUTE AI</>}
                      </button>
                   </div>
                 )}
              </div>
           </div>
         )}
      </div>
      <input ref={galleryInputRef} type="file" multiple accept="image/*" onChange={handleFileUpload} className="hidden" />
    </div>
  );
};

export default App;