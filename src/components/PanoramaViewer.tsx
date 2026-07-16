import React, { useRef, useEffect, useState } from 'react';
import 'pannellum/build/pannellum.css';

// Déclarer pannellum comme variable globale
declare global {
  interface Window {
    pannellum: any;
  }
}
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCompass,
  faExpand,
  faCompress,
  faTimes,
  faHome,
  faInfoCircle,
  faPlay,
  faPause,
  faCube,
  faRoute,
  faChevronLeft,
  faChevronRight,
  faMap,
  faList,
  faArrowRight
} from '@fortawesome/free-solid-svg-icons';

interface PanoramaViewerProps {
  imageUrl: string;
  onClose?: () => void;
  hotspots?: Array<{
    position: { yaw: number; pitch: number };
    label: string;
    onClick: () => void;
  }>;
  scenes?: Array<{
    id: string;
    name: string;
    imageUrl: string;
    position?: { x: number; y: number; z: number };
  }>;
}

const PanoramaViewer: React.FC<PanoramaViewerProps> = ({ imageUrl, onClose, hotspots = [], scenes = [] }) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const viewerInstanceRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showDollhouse, setShowDollhouse] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Gestion du plein écran
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(err => {
        console.error('Erreur lors de la demande de plein écran:', err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      });
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Initialiser Pannellum quand la visite démarre
  useEffect(() => {
    if (!isStarted || !viewerRef.current || !imageUrl) return;

    setIsLoading(true);

    // Configuration Pannellum similaire à l'hôtel Monte Cristo
    const config: any = {
      type: 'equirectangular',
      panorama: imageUrl,
      autoLoad: true,
      autoRotate: 0,
      compass: true,
      showControls: true,
      showFullscreenCtrl: false,
      showZoomCtrl: true,
      keyboardZoom: true,
      mouseZoom: true,
      doubleClickZoom: true,
      draggable: true,
      disableKeyboardCtrl: false,
      crossOrigin: imageUrl.startsWith('data:') ? '' : 'anonymous',
      hfov: 100,
      minHfov: 50,
      maxHfov: 120,
      pitch: 0,
      yaw: 0,
      haov: 360,
      vaov: 180,
      vOffset: 0,
      backgroundColor: [0, 0, 0],
      hotSpots: hotspots.map((hotspot) => ({
        pitch: hotspot.position.pitch,
        yaw: hotspot.position.yaw,
        type: 'info',
        text: hotspot.label,
        cssClass: 'custom-hotspot',
        createTooltipFunc: (hotSpotDiv: HTMLElement) => {
          hotSpotDiv.addEventListener('click', () => {
            hotspot.onClick();
          });
        }
      }))
    };

    // Ajouter les scènes si disponibles
    if (scenes.length > 0) {
      config.scenes = {};
      scenes.forEach((scene) => {
        config.scenes[scene.id] = {
          type: 'equirectangular',
          panorama: scene.imageUrl,
          hfov: 100,
          minHfov: 50,
          maxHfov: 120
        };
      });
      config.default = scenes[0]?.id || 'first';
    }

    // Charger Pannellum dynamiquement
    const loadPannellum = async () => {
      try {
        // Import dynamique du fichier JS de Pannellum
        await import('pannellum/build/pannellum.js');
        
        // Attendre que Pannellum s'initialise sur window (il expose window.pannellum)
        let attempts = 0;
        const maxAttempts = 20;
        
        const waitForPannellum = (): Promise<any> => {
          return new Promise((resolve, reject) => {
            const check = () => {
              if ((window as any).pannellum && (window as any).pannellum.viewer) {
                resolve((window as any).pannellum);
              } else if (attempts < maxAttempts) {
                attempts++;
                setTimeout(check, 100);
              } else {
                reject(new Error('Pannellum n\'a pas pu être chargé après ' + maxAttempts + ' tentatives'));
              }
            };
            check();
          });
        };
        
        const pannellumLib = await waitForPannellum();
        
        if (!pannellumLib || !pannellumLib.viewer) {
          throw new Error('Pannellum viewer non disponible');
        }
        
        const viewer = pannellumLib.viewer(viewerRef.current, config);
        viewerInstanceRef.current = viewer;

        viewer.on('load', () => {
          setIsLoading(false);
          console.log('Panorama chargé avec succès');
        });

        viewer.on('error', (error: any) => {
          console.error('Erreur de chargement du panorama:', error);
          setIsLoading(false);
        });
      } catch (error) {
        console.error('Erreur lors de l\'initialisation de Pannellum:', error);
        setIsLoading(false);
      }
    };

    loadPannellum();

    return () => {
      if (viewerInstanceRef.current) {
        try {
          viewerInstanceRef.current.destroy();
        } catch (e) {
          console.error('Erreur lors de la destruction du viewer:', e);
        }
      }
    };
  }, [isStarted, imageUrl, hotspots, scenes]);

  // Navigation entre les scènes
  const goToScene = (sceneId: string) => {
    if (viewerInstanceRef.current) {
      viewerInstanceRef.current.loadScene(sceneId);
    }
  };

  const nextScene = () => {
    if (scenes.length > 0) {
      const nextIndex = (currentSceneIndex + 1) % scenes.length;
      setCurrentSceneIndex(nextIndex);
      goToScene(scenes[nextIndex].id);
    }
  };

  const prevScene = () => {
    if (scenes.length > 0) {
      const prevIndex = (currentSceneIndex - 1 + scenes.length) % scenes.length;
      setCurrentSceneIndex(prevIndex);
      goToScene(scenes[prevIndex].id);
    }
  };

  // Visite guidée automatique
  useEffect(() => {
    if (!showTour || !viewerInstanceRef.current) return;

    let tourInterval: NodeJS.Timeout | null = null;

    if (scenes.length > 1) {
      // Si plusieurs scènes, naviguer entre elles
      tourInterval = setInterval(() => {
        if (viewerInstanceRef.current && scenes.length > 1) {
          const nextIndex = (currentSceneIndex + 1) % scenes.length;
          setCurrentSceneIndex(nextIndex);
          viewerInstanceRef.current.loadScene(scenes[nextIndex].id);
        }
      }, 5000); // Changer de scène toutes les 5 secondes
    } else {
      // Si une seule image, faire une rotation automatique
      let currentYaw = viewerInstanceRef.current.getYaw() || 0;
      tourInterval = setInterval(() => {
        if (viewerInstanceRef.current) {
          currentYaw += 1; // Rotation de 1 degré par intervalle pour une rotation plus fluide
          viewerInstanceRef.current.setYaw(currentYaw);
        }
      }, 50); // Rotation fluide toutes les 50ms
    }

    return () => {
      if (tourInterval) {
        clearInterval(tourInterval);
      }
    };
  }, [showTour, scenes.length, currentSceneIndex]);

  return (
    <div 
      ref={containerRef}
      className={`relative w-full bg-gradient-to-br from-gray-900 via-black to-gray-900 rounded-2xl overflow-hidden border-2 border-white/10 shadow-2xl transition-all duration-300 ${
        isFullscreen ? 'fixed inset-0 z-[99999] rounded-none' : 'h-[700px]'
      }`}
    >
      {/* Écran de démarrage - Style Hôtel Monte Cristo */}
      {!isStarted && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-black/95 via-gray-900/95 to-black/95 backdrop-blur-sm">
          <div className="text-center px-6 max-w-2xl">
            <div className="mb-8">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border-2 border-white/20">
                <FontAwesomeIcon icon={faCompass} className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-4xl font-bold text-white mb-4">Visite Virtuelle 360°</h2>
              <p className="text-lg text-white/80 mb-2">Explorez l'espace en toute liberté</p>
              <p className="text-sm text-white/60">Découvrez chaque détail de cet environnement</p>
            </div>
            
            <button
              onClick={() => setIsStarted(true)}
              className="group relative px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-xl shadow-2xl transition-all duration-300 transform hover:scale-105 active:scale-95 overflow-hidden"
            >
              <span className="relative z-10 flex items-center gap-3">
                <FontAwesomeIcon icon={faPlay} className="w-5 h-5" />
                <span className="text-lg">Démarrer la visite</span>
                <FontAwesomeIcon icon={faArrowRight} className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
            </button>

            <div className="mt-8 flex items-center justify-center gap-6 text-white/60 text-sm">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faInfoCircle} className="w-4 h-4" />
                <span>Cliquez et glissez pour explorer</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Overlay de chargement */}
      {isLoading && isStarted && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
            <div className="text-white text-lg font-medium">Chargement de la visite virtuelle...</div>
          </div>
        </div>
      )}

      {/* Conteneur Pannellum */}
      {isStarted && (
        <div 
          ref={viewerRef} 
          className="w-full h-full"
          style={{ minHeight: '700px' }}
        />
      )}

      {/* Barre de contrôle supérieure - Style Hôtel Monte Cristo */}
      {isStarted && (
        <div className="absolute top-0 left-0 right-0 z-30 bg-gradient-to-b from-black/90 via-black/70 to-transparent backdrop-blur-xl">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20 shadow-lg">
                <FontAwesomeIcon icon={faCompass} className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-lg">Visite Virtuelle 360°</h3>
                <p className="text-white/70 text-xs">Explorez l'espace en toute liberté</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleFullscreen}
                className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm flex items-center justify-center transition-all border border-white/20 group"
                title={isFullscreen ? "Quitter le plein écran" : "Plein écran"}
              >
                <FontAwesomeIcon 
                  icon={isFullscreen ? faCompress : faExpand} 
                  className="w-4 h-4 text-white group-hover:scale-110 transition-transform" 
                />
              </button>
              {onClose && (
                <button
                  onClick={onClose}
                  className="w-10 h-10 rounded-lg bg-red-500/20 hover:bg-red-500/30 backdrop-blur-sm flex items-center justify-center transition-all border border-red-500/30 group"
                  title="Fermer"
                >
                  <FontAwesomeIcon icon={faTimes} className="w-4 h-4 text-white group-hover:rotate-90 transition-transform" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Contrôles inférieurs - Style Hôtel Monte Cristo */}
      {isStarted && (
        <div className="absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/90 via-black/70 to-transparent backdrop-blur-xl">
          <div className="flex items-center justify-between px-6 py-4">
            {/* Contrôles de gauche */}
            <div className="flex items-center gap-3">
              {/* Bouton Dollhouse (modèle 3D) */}
              <button
                onClick={() => setShowDollhouse(!showDollhouse)}
                className={`px-4 py-2 rounded-lg backdrop-blur-sm border transition-all flex items-center gap-2 ${
                  showDollhouse 
                    ? 'bg-blue-500/30 border-blue-500/50 text-white' 
                    : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20 hover:text-white'
                }`}
                title="Modèle 3D (Dollhouse)"
              >
                <FontAwesomeIcon icon={faCube} className="w-4 h-4" />
                <span className="text-sm font-medium">3D</span>
              </button>

              {/* Bouton Visite guidée */}
              <button
                onClick={() => {
                  setShowTour(!showTour);
                }}
                className={`px-4 py-2 rounded-lg backdrop-blur-sm border transition-all flex items-center gap-2 ${
                  showTour 
                    ? 'bg-green-500/30 border-green-500/50 text-white' 
                    : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20 hover:text-white'
                }`}
                title={scenes.length > 1 ? "Visite guidée (navigation entre scènes)" : "Visite guidée (rotation automatique)"}
              >
                <FontAwesomeIcon icon={showTour ? faPause : faPlay} className="w-4 h-4" />
                <span className="text-sm font-medium">Visite guidée</span>
              </button>

              {/* Navigation entre scènes ou rotation */}
              <div className="flex items-center gap-2 ml-2">
                <button
                  onClick={prevScene}
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 flex items-center justify-center transition-all text-white"
                  title={scenes.length > 1 ? "Scène précédente" : "Rotation à gauche"}
                >
                  <FontAwesomeIcon icon={faChevronLeft} className="w-3 h-3" />
                </button>
                {scenes.length > 1 && (
                  <div className="px-3 py-1 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 text-white text-xs font-medium">
                    {currentSceneIndex + 1} / {scenes.length}
                  </div>
                )}
                <button
                  onClick={nextScene}
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 flex items-center justify-center transition-all text-white"
                  title={scenes.length > 1 ? "Scène suivante" : "Rotation à droite"}
                >
                  <FontAwesomeIcon icon={faChevronRight} className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Contrôles de droite */}
            <div className="flex items-center gap-2">
              {/* Liste des scènes - seulement si plusieurs scènes */}
              {scenes.length > 1 && (
                <button
                  onClick={() => {}}
                  className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 flex items-center justify-center transition-all text-white"
                  title="Liste des scènes"
                >
                  <FontAwesomeIcon icon={faList} className="w-4 h-4" />
                </button>
              )}

              {/* Bouton Home (réinitialiser) */}
              <button
                onClick={() => {
                  if (viewerInstanceRef.current) {
                    viewerInstanceRef.current.setPitch(0);
                    viewerInstanceRef.current.setYaw(0);
                    viewerInstanceRef.current.setHfov(100);
                  }
                }}
                className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 flex items-center justify-center transition-all text-white"
                title="Réinitialiser la vue"
              >
                <FontAwesomeIcon icon={faHome} className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Panneau Dollhouse (modèle 3D) */}
      {showDollhouse && isStarted && (
        <div className="absolute bottom-20 left-6 z-30 bg-black/90 backdrop-blur-xl rounded-2xl p-4 shadow-2xl border border-white/10 max-w-xs">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-white font-semibold text-sm flex items-center gap-2">
              <FontAwesomeIcon icon={faCube} className="w-4 h-4" />
              Modèle 3D
            </h4>
            <button
              onClick={() => setShowDollhouse(false)}
              className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all text-white"
            >
              <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
            </button>
          </div>
          <p className="text-white/60 text-xs mb-3">
            Vue d'ensemble de l'espace en 3D
          </p>
          <div className="h-32 bg-white/5 rounded-lg flex items-center justify-center border border-white/10">
            <p className="text-white/40 text-xs">Vue 3D à venir</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PanoramaViewer;
