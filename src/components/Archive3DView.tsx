import React, { Suspense, useState, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { LocalArchivage, Armoire, Etagere, BoiteArchive, Archive, CategorieFichier, Courrier } from '../types';
import { archive3DConfigService, Archive3DConfig } from '../services/archive3DConfigService';
import { courrierService } from '../services/courrierService';
import { categorieFichierService } from '../services/categorieFichierService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFolder, faFolderOpen, faFile, faChevronRight, faChevronDown, faTimes, faBox, faLayerGroup, faWarehouse, faFileAlt, faChevronLeft, faInfoCircle } from '@fortawesome/free-solid-svg-icons';

interface Archive3DViewProps {
  locaux: LocalArchivage[];
  armoires: Armoire[];
  etageres: Etagere[];
  boites: BoiteArchive[];
  archives?: Archive[];
  selectedLocalId?: string | null;
  selectedArmoireId?: string | null;
  selectedEtagereId?: string | null;
  selectedBoiteId?: string | null;
  selectedCourrierId?: string | null;
  config?: Archive3DConfig;
  onSelectArmoire?: (armoire: Armoire) => void;
  onSelectEtagere?: (etagere: Etagere) => void;
  onSelectBoite?: (boite: BoiteArchive) => void;
  onSelectCourrier?: (courrier: Courrier) => void;
  onSelectDossier?: (dossier: CategorieFichier, courrier: Courrier) => void;
}

interface SceneProps extends Archive3DViewProps {
  config: Archive3DConfig;
  selectedArmoireId?: string | null;
  selectedEtagereId?: string | null;
  selectedBoiteId?: string | null;
  openBoites: Set<string>;
  selectedDossierId?: string | null;
  onArmoireClick: (armoire: Armoire) => void;
  onEtagereClick: (etagere: Etagere) => void;
  onBoiteClick: (boite: BoiteArchive) => void;
  onDossierClick: (archive: Archive) => void;
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

const normalizeConfig = (cfg?: Partial<Archive3DConfig>): Archive3DConfig => {
  const base = archive3DConfigService.getConfig();
  const merged = { ...base, ...(cfg || {}) };

  return {
    ...merged,
    frontWallOpacity: clamp(merged.frontWallOpacity ?? base.frontWallOpacity ?? 1, 0, 1),
    planGridSpacing: Math.max(merged.planGridSpacing ?? base.planGridSpacing ?? 1, 0.1),
    roomWidth: merged.roomWidth || base.roomWidth || 8,
    roomDepth: merged.roomDepth || base.roomDepth || 5,
    roomHeight: merged.roomHeight || base.roomHeight || 3,
    wallThickness: merged.wallThickness || base.wallThickness || 0.2,
    armoiresPerRow: merged.armoiresPerRow || base.armoiresPerRow || 3,
    armoireSpacing: merged.armoireSpacing || base.armoireSpacing || 1.5,
    roomDoorWidth: merged.roomDoorWidth || base.roomDoorWidth || 1,
    roomDoorHeight: merged.roomDoorHeight || base.roomDoorHeight || 2.1,
    roomDoorOffset: merged.roomDoorOffset ?? base.roomDoorOffset ?? 0,
    roomDoorOpenAngle: merged.roomDoorOpenAngle ?? base.roomDoorOpenAngle ?? 0,
    boitesPerRow: merged.boitesPerRow || base.boitesPerRow || 5,
    dossiersPerBoite: merged.dossiersPerBoite || base.dossiersPerBoite || 6,
    armoireBackOffset: merged.armoireBackOffset ?? base.armoireBackOffset ?? 0.8,
    armoireBaseXOffset: merged.armoireBaseXOffset ?? base.armoireBaseXOffset ?? 0,
    armoireOffsetZ: merged.armoireOffsetZ ?? base.armoireOffsetZ ?? 0,
    showFrontWall: merged.showFrontWall ?? base.showFrontWall ?? true,
    planGridEnabled: merged.planGridEnabled ?? base.planGridEnabled ?? true,
    showPortes: merged.showPortes ?? base.showPortes ?? true,
    porteOuverte: merged.porteOuverte ?? base.porteOuverte ?? false,
    roomDoorEnabled: merged.roomDoorEnabled ?? base.roomDoorEnabled ?? true,
    roomDoorOpen: merged.roomDoorOpen ?? base.roomDoorOpen ?? true,
    showDossiers: merged.showDossiers ?? base.showDossiers ?? true,
    showEtiquettes: merged.showEtiquettes ?? base.showEtiquettes ?? true,
  };
};

// Composant pour un dossier dans une boîte
interface FolderProps {
  position: [number, number, number];
  index: number;
  config: Archive3DConfig;
  archive?: Archive;
  isSelected?: boolean;
  onClick?: (e?: any) => void;
  onPointerOver?: (e?: any) => void;
  onPointerOut?: () => void;
}

const Folder: React.FC<FolderProps> = ({ position, index, config, archive, isSelected, onClick, onPointerOver, onPointerOut }) => {
  if (!config.showDossiers) return null;
  
  const colorIndex = index % config.dossierColors.length;
  const color = isSelected ? '#10b981' : config.dossierColors[colorIndex];
  
  return (
    <group position={position}>
      {/* Corps principal du classeur - forme réaliste */}
      <mesh
        position={[0, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(e);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onPointerOver?.(e);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          onPointerOut?.();
          document.body.style.cursor = 'default';
        }}
      >
        {/* Corps principal du classeur */}
        <boxGeometry args={[0.035, 0.1, 0.13]} />
        <meshStandardMaterial
          color={color}
          metalness={0.1}
          roughness={0.9}
          emissive={isSelected ? '#10b981' : '#000000'}
          emissiveIntensity={isSelected ? 0.3 : 0}
        />
      </mesh>
      
      {/* Dos du classeur (plus épais) */}
      <mesh
        position={[0, 0, -0.065]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[0.04, 0.1, 0.02]} />
        <meshStandardMaterial
          color={color}
          metalness={0.1}
          roughness={0.9}
        />
      </mesh>
      
      {/* Anneaux métalliques du classeur (2 anneaux) */}
      <mesh
        position={[-0.015, 0, -0.055]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
      >
        <torusGeometry args={[0.008, 0.002, 8, 16]} />
        <meshStandardMaterial
          color="#c0c0c0"
          metalness={0.9}
          roughness={0.1}
        />
      </mesh>
      <mesh
        position={[0.015, 0, -0.055]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
      >
        <torusGeometry args={[0.008, 0.002, 8, 16]} />
        <meshStandardMaterial
          color="#c0c0c0"
          metalness={0.9}
          roughness={0.1}
        />
      </mesh>
      
      {/* Étiquette blanche sur le dos */}
      {config.showEtiquettes && (
        <mesh position={[0, 0.05, -0.064]} rotation={[0, 0, Math.PI / 2]}>
          <planeGeometry args={[0.08, 0.025]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      )}
      
      {/* Ligne de séparation sur le devant */}
      <mesh
        position={[0, 0, 0.066]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <boxGeometry args={[0.001, 0.1, 0.13]} />
        <meshStandardMaterial
          color="#000000"
          opacity={0.3}
          transparent
        />
      </mesh>
    </group>
  );
};

// Composant pour une boîte d'archive avec dossiers
const ArchiveBox: React.FC<{
  position: [number, number, number];
  boite: BoiteArchive;
  archives?: Archive[];
  config: Archive3DConfig;
  isSelected?: boolean;
  isOpen?: boolean;
  selectedDossierId?: string | null;
  onBoiteClick?: () => void;
  onDossierClick?: (archive: Archive) => void;
}> = ({ position, boite, archives = [], config, isSelected, isOpen, selectedDossierId, onBoiteClick, onDossierClick }) => {
  const boiteArchives = archives.filter(a => a.boiteId === boite.id);
  const dossiersCount = Math.min(boiteArchives.length, config.dossiersPerBoite);
  const dossierSpacing = 0.025;
  const { width, height, depth } = config.boiteSize;
  
  // Animation de sortie de la boîte
  const boxRef = useRef<THREE.Group>(null);
  const animatedOffset = useRef(0);
  
  useFrame((state, delta) => {
    const targetOffset = isOpen ? 0.3 : 0; // Distance de sortie plus importante
    const diff = targetOffset - animatedOffset.current;
    const speed = 2.0; // Vitesse d'animation
    animatedOffset.current += diff * Math.min(speed * delta, 1); // Animation fluide avec delta time
    
    if (boxRef.current) {
      boxRef.current.position.z = position[2] + animatedOffset.current;
    }
  });
  
  return (
    <group 
      ref={boxRef}
      position={[position[0], position[1], position[2]]}
    >
      {/* Boîte principale - carton avec coins renforcés */}
      <mesh
        position={[0, 0, 0]}
        castShadow
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onBoiteClick?.();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'default';
        }}
      >
        <boxGeometry args={[width * 1.2, height * 1.2, depth * 1.2]} />
        <meshStandardMaterial
          color={isSelected ? '#f97316' : (boite.estPleine ? config.boitePleineColor || '#d97706' : config.boiteVideColor || '#fbbf24')}
          metalness={0.1}
          roughness={0.9}
          emissive={isSelected ? '#f97316' : '#000000'}
          emissiveIntensity={isSelected ? 0.3 : 0}
        />
      </mesh>
      
      {/* Renforts aux coins (4 coins) */}
      {[
        [-width * 0.6, -height * 0.6],
        [width * 0.6, -height * 0.6],
        [-width * 0.6, height * 0.6],
        [width * 0.6, height * 0.6]
      ].map(([x, y], idx) => (
        <mesh
          key={`corner-${idx}`}
          position={[x, y, depth * 0.6]}
          castShadow
        >
          <boxGeometry args={[0.02, 0.02, 0.02]} />
          <meshStandardMaterial
            color="#8b5a2b"
            metalness={0.2}
            roughness={0.8}
          />
        </mesh>
      ))}
      
      {/* Bordure avant de la boîte - couvercle */}
      <mesh position={[0, 0, depth * 0.6]} castShadow receiveShadow>
        <boxGeometry args={[width * 1.22, height * 1.22, 0.02]} />
        <meshStandardMaterial
          color={isSelected ? '#ea580c' : '#c2410c'}
          metalness={0.2}
          roughness={0.8}
        />
      </mesh>
      
      {/* Étiquette blanche avec numéro */}
      {config.showEtiquettes && (
        <mesh position={[0, 0, depth * 0.61]}>
          <planeGeometry args={[width * 0.9, height * 0.7]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      )}
      
      {/* Poignée de transport (si boîte pleine) */}
      {boite.estPleine && (
        <mesh position={[0, height * 0.7, depth * 0.6]} castShadow>
          <boxGeometry args={[0.15, 0.02, 0.01]} />
          <meshStandardMaterial
            color="#1f2937"
            metalness={0.1}
            roughness={0.9}
          />
        </mesh>
      )}
      
      {/* Dossiers dans la boîte (si elle contient des archives) */}
      {dossiersCount > 0 && config.showDossiers && (
        <group position={[-width * 0.3, -height * 0.3, 0.01]}>
          {boiteArchives.slice(0, dossiersCount).map((archive, i) => {
            const xPos = (i % 3) * dossierSpacing;
            const zPos = Math.floor(i / 3) * dossierSpacing;
            return (
              <Folder
                key={archive.id}
                position={[xPos, 0, zPos]}
                index={i}
                config={config}
                archive={archive}
                isSelected={selectedDossierId === archive.id}
                onClick={(e?: any) => {        
                  e?.stopPropagation();
                  onDossierClick?.(archive);
                }}
                onPointerOver={(e?: any) => {
                  e?.stopPropagation();
                  document.body.style.cursor = 'pointer';
                }}
                onPointerOut={() => {
                  document.body.style.cursor = 'default';
                }}
              />
            );
          })}
        </group>
      )}
    </group>
  );
};

// Composant pour une étagère réaliste
const Shelf: React.FC<{
  position: [number, number, number];
  etagere: Etagere;
  boites: BoiteArchive[];
  archives?: Archive[];
  config: Archive3DConfig;
  isSelected?: boolean;
  selectedBoiteId?: string | null;
  openBoites: Set<string>;
  selectedDossierId?: string | null;
  onEtagereClick?: () => void;
  onBoiteClick?: (boite: BoiteArchive) => void;
  onDossierClick?: (archive: Archive) => void;
}> = ({ position, etagere, boites, archives = [], config, isSelected, selectedBoiteId, openBoites, selectedDossierId, onEtagereClick, onBoiteClick, onDossierClick }) => {
  const shelfBoites = boites.filter(b => b.etagereId === etagere.id);
  const boitesPerRow = config.boitesPerRow;
  const boiteSpacing = 0.25;
  const thickness = config.etagereThickness || 0.02;
  const shelfWidth = 0.95;
  const shelfDepth = 0.4;
  
  return (
    <group position={position}>
      {/* Planche principale de l'étagère - bois ou métal */}
      <mesh
        position={[0, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        castShadow
        onClick={(e) => {
          e.stopPropagation();
          onEtagereClick?.();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'default';
        }}
      >
        <boxGeometry args={[shelfWidth, shelfDepth, thickness * 3]} />
        <meshStandardMaterial
          color={isSelected ? '#3b82f6' : config.etagereColor || '#8b7355'}
          roughness={0.7}
          metalness={0.2}
          emissive={isSelected ? '#3b82f6' : '#000000'}
          emissiveIntensity={isSelected ? 0.3 : 0}
        />
      </mesh>
      
      {/* Bord avant de l'étagère - barre de sécurité */}
      <mesh
        position={[0, thickness * 1.5, shelfDepth / 2]}
        rotation={[0, 0, 0]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[shelfWidth, thickness * 4, 0.02]} />
        <meshStandardMaterial
          color={isSelected ? '#2563eb' : '#6b5d4f'}
          roughness={0.6}
          metalness={0.3}
        />
      </mesh>
      
      {/* Support arrière - panneau vertical */}
      <mesh
        position={[0, thickness * 1.5, -shelfDepth / 2]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[shelfWidth, thickness * 4, 0.02]} />
        <meshStandardMaterial
          color={isSelected ? '#2563eb' : '#6b5d4f'}
          roughness={0.6}
          metalness={0.3}
        />
      </mesh>
      
      {/* Supports latéraux - montants verticaux */}
      <mesh
        position={[-shelfWidth / 2, thickness * 1.5, 0]}
        rotation={[0, 0, 0]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[0.04, thickness * 4, shelfDepth]} />
        <meshStandardMaterial
          color={isSelected ? '#2563eb' : '#5a4a3a'}
          roughness={0.5}
          metalness={0.4}
        />
      </mesh>
      <mesh
        position={[shelfWidth / 2, thickness * 1.5, 0]}
        rotation={[0, 0, 0]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[0.04, thickness * 4, shelfDepth]} />
        <meshStandardMaterial
          color={isSelected ? '#2563eb' : '#5a4a3a'}
          roughness={0.5}
          metalness={0.4}
        />
      </mesh>
      
      {/* Renforts métalliques (si étagère métallique) */}
      <mesh
        position={[-shelfWidth / 3, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[0.01, shelfDepth, thickness * 2]} />
        <meshStandardMaterial
          color="#c0c0c0"
          metalness={0.9}
          roughness={0.1}
        />
      </mesh>
      <mesh
        position={[shelfWidth / 3, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[0.01, shelfDepth, thickness * 2]} />
        <meshStandardMaterial
          color="#c0c0c0"
          metalness={0.9}
          roughness={0.1}
        />
      </mesh>
      
      {/* Boîtes sur l'étagère */}
      {shelfBoites.slice(0, boitesPerRow).map((boite, i) => {
        const xPos = (i - (boitesPerRow - 1) / 2) * boiteSpacing;
        return (
          <ArchiveBox
            key={boite.id}
            position={[xPos, 0.1, 0]}
            boite={boite}
            archives={archives}
            config={config}
            isSelected={selectedBoiteId === boite.id}
            isOpen={openBoites.has(boite.id)}
            selectedDossierId={selectedDossierId}
            onBoiteClick={() => onBoiteClick?.(boite)}
            onDossierClick={onDossierClick}
          />
        );
      })}
    </group>
  );
};

// Composant pour une armoire (coffre) avec portes réalistes
const Cabinet: React.FC<{
  position: [number, number, number];
  armoire: Armoire;
  etageres: Etagere[];
  boites: BoiteArchive[];
  archives?: Archive[];
  config: Archive3DConfig;
  isSelected?: boolean;
  selectedEtagereId?: string | null;
  selectedBoiteId?: string | null;
  openBoites: Set<string>;
  selectedDossierId?: string | null;
  onArmoireClick?: () => void;
  onEtagereClick: (etagere: Etagere) => void;
  onBoiteClick: (boite: BoiteArchive) => void;
  onDossierClick: (archive: Archive) => void;
}> = ({ position, armoire, etageres, boites, archives = [], config, isSelected, selectedEtagereId, selectedBoiteId, openBoites, selectedDossierId, onArmoireClick, onEtagereClick, onBoiteClick, onDossierClick }) => {
  const armoireEtageres = etageres.filter(e => e.armoireId === armoire.id);
  const shelfHeight = 0.4;
  const totalHeight = armoireEtageres.length * shelfHeight + 0.3;
  const doorThickness = config.armoireDoorThickness || 0.03;
  const doorOpenAngle = config.porteOuverte ? Math.PI / 3 : 0; // 60 degrés si ouvert
  const armoireWidth = 1.0;
  const armoireDepth = 0.6;
  
  return (
    <group position={position}>
      {/* Structure principale de l'armoire - coffre métallique */}
      <mesh
        position={[0, totalHeight / 2, 0]}
        castShadow
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onArmoireClick?.();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'default';
        }}
      >
        <boxGeometry args={[armoireWidth, totalHeight, armoireDepth]} />
        <meshStandardMaterial
          color={isSelected ? '#8b5cf6' : config.armoireColor || '#4b5563'}
          metalness={0.8}
          roughness={0.2}
          emissive={isSelected ? '#8b5cf6' : '#000000'}
          emissiveIntensity={isSelected ? 0.3 : 0}
        />
      </mesh>
      
      {/* Panneaux latéraux avec relief */}
      <mesh
        position={[-armoireWidth / 2, totalHeight / 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[armoireDepth, totalHeight, 0.02]} />
        <meshStandardMaterial
          color={isSelected ? '#7c3aed' : '#374151'}
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>
      <mesh
        position={[armoireWidth / 2, totalHeight / 2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[armoireDepth, totalHeight, 0.02]} />
        <meshStandardMaterial
          color={isSelected ? '#7c3aed' : '#374151'}
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>
      
      {/* Bordure supérieure du coffre - plus épaisse */}
      <mesh
        position={[0, totalHeight, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[armoireWidth + 0.02, 0.08, armoireDepth + 0.02]} />
        <meshStandardMaterial
          color={isSelected ? '#7c3aed' : '#1f2937'}
          metalness={0.8}
          roughness={0.15}
        />
      </mesh>
      
      {/* Bordure inférieure du coffre avec pieds */}
      <mesh
        position={[0, 0, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[armoireWidth + 0.02, 0.08, armoireDepth + 0.02]} />
        <meshStandardMaterial
          color={isSelected ? '#7c3aed' : '#1f2937'}
          metalness={0.8}
          roughness={0.15}
        />
      </mesh>
      
      {/* Pieds de l'armoire (4 pieds) */}
      {[-armoireWidth / 2 + 0.05, armoireWidth / 2 - 0.05].map((x, i) => 
        [-armoireDepth / 2 + 0.05, armoireDepth / 2 - 0.05].map((z, j) => (
          <mesh
            key={`foot-${i}-${j}`}
            position={[x, -0.04, z]}
            castShadow
            receiveShadow
          >
            <cylinderGeometry args={[0.02, 0.02, 0.08, 16]} />
            <meshStandardMaterial
              color="#1f2937"
              metalness={0.9}
              roughness={0.1}
            />
          </mesh>
        ))
      )}
      
      {/* Portes de l'armoire - gauche et droite avec charnières */}
      {config.showPortes && (
        <>
          {/* Porte gauche */}
          <group position={[-armoireWidth / 2 + 0.001, totalHeight / 2, armoireDepth / 2]} rotation={[0, doorOpenAngle, 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[armoireWidth / 2 - 0.002, totalHeight - 0.1, doorThickness]} />
              <meshStandardMaterial
                color={config.armoireColor || '#4b5563'}
                metalness={0.7}
                roughness={0.25}
              />
            </mesh>
            {/* Charnière gauche (2 charnières) */}
            {[totalHeight * 0.25, totalHeight * 0.75].map((y, idx) => (
              <mesh
                key={`hinge-left-${idx}`}
                position={[-armoireWidth / 4, y - totalHeight / 2, -doorThickness / 2]}
                rotation={[0, 0, Math.PI / 2]}
                castShadow
              >
                <cylinderGeometry args={[0.01, 0.01, 0.02, 16]} />
                <meshStandardMaterial
                  color="#c0c0c0"
                  metalness={0.9}
                  roughness={0.1}
                />
              </mesh>
            ))}
            {/* Poignée gauche - style moderne */}
            <mesh position={[armoireWidth / 4 - 0.05, 0, doorThickness / 2 + 0.01]} castShadow>
              <boxGeometry args={[0.04, 0.08, 0.02]} />
              <meshStandardMaterial
                color="#fbbf24"
                metalness={0.95}
                roughness={0.05}
              />
            </mesh>
          </group>
          
          {/* Porte droite */}
          <group position={[armoireWidth / 2 - 0.001, totalHeight / 2, armoireDepth / 2]} rotation={[0, -doorOpenAngle, 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[armoireWidth / 2 - 0.002, totalHeight - 0.1, doorThickness]} />
              <meshStandardMaterial
                color={config.armoireColor || '#4b5563'}
                metalness={0.7}
                roughness={0.25}
              />
            </mesh>
            {/* Charnière droite (2 charnières) */}
            {[totalHeight * 0.25, totalHeight * 0.75].map((y, idx) => (
              <mesh
                key={`hinge-right-${idx}`}
                position={[armoireWidth / 4, y - totalHeight / 2, -doorThickness / 2]}
                rotation={[0, 0, Math.PI / 2]}
                castShadow
              >
                <cylinderGeometry args={[0.01, 0.01, 0.02, 16]} />
                <meshStandardMaterial
                  color="#c0c0c0"
                  metalness={0.9}
                  roughness={0.1}
                />
              </mesh>
            ))}
            {/* Poignée droite - style moderne */}
            <mesh position={[-armoireWidth / 4 + 0.05, 0, doorThickness / 2 + 0.01]} castShadow>
              <boxGeometry args={[0.04, 0.08, 0.02]} />
              <meshStandardMaterial
                color="#fbbf24"
                metalness={0.95}
                roughness={0.05}
              />
            </mesh>
          </group>
          
          {/* Serrure centrale avec trou de serrure */}
          <mesh
            position={[0, totalHeight * 0.5, armoireDepth / 2 + doorThickness / 2 + 0.01]}
            castShadow
          >
            <cylinderGeometry args={[0.025, 0.025, 0.015, 16]} />
            <meshStandardMaterial
              color="#1f2937"
              metalness={0.9}
              roughness={0.1}
            />
          </mesh>
          {/* Trou de serrure */}
          <mesh
            position={[0, totalHeight * 0.5, armoireDepth / 2 + doorThickness / 2 + 0.02]}
            castShadow
          >
            <boxGeometry args={[0.008, 0.015, 0.005]} />
            <meshStandardMaterial
              color="#000000"
              metalness={0.1}
              roughness={0.9}
            />
          </mesh>
        </>
      )}
      
      {/* Étiquette de l'armoire sur le dessus */}
      {config.showEtiquettes && (
        <mesh position={[0, totalHeight + 0.1, 0.3]}>
          <planeGeometry args={[0.4, 0.1]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      )}
      
      {/* Étagères à l'intérieur */}
      {armoireEtageres.map((etagere, i) => {
        const yPos = i * shelfHeight + 0.2;
        return (
          <Shelf
            key={etagere.id}
            position={[0, yPos, 0.1]}
            etagere={etagere}
            boites={boites}
            archives={archives}
            config={config}
            isSelected={selectedEtagereId === etagere.id}
            selectedBoiteId={selectedBoiteId}
            openBoites={openBoites}
            selectedDossierId={selectedDossierId}
            onEtagereClick={() => onEtagereClick(etagere)}
            onBoiteClick={onBoiteClick}
            onDossierClick={onDossierClick}
          />
        );
      })}
    </group>
  );
};

// Composant pour un local
const StorageRoom: React.FC<{
  position: [number, number, number];
  local: LocalArchivage;
  armoires: Armoire[];
  etageres: Etagere[];
  boites: BoiteArchive[];
  archives?: Archive[];
  config: Archive3DConfig;
  selectedArmoireId?: string | null;
  selectedEtagereId?: string | null;
  selectedBoiteId?: string | null;
  openBoites: Set<string>;
  selectedDossierId?: string | null;
  onArmoireClick: (armoire: Armoire) => void;
  onEtagereClick: (etagere: Etagere) => void;
  onBoiteClick: (boite: BoiteArchive) => void;
  onDossierClick: (archive: Archive) => void;
}> = ({ position, local, armoires, etageres, boites, archives = [], config, selectedArmoireId, selectedEtagereId, selectedBoiteId, openBoites, selectedDossierId, onArmoireClick, onEtagereClick, onBoiteClick, onDossierClick }) => {
  const localArmoires = armoires.filter(a => a.localId === local.id);
  const armoiresPerRow = config.armoiresPerRow || 3;
  const armoireSpacing = config.armoireSpacing || 1.5;
  const roomWidth = config.roomWidth || (armoiresPerRow * armoireSpacing + 2);
  const roomDepth = config.roomDepth || 5;
  const roomHeight = config.roomHeight || 3;
  const wallThickness = config.wallThickness || 0.2;
  const planGridSpacing = Math.max(config.planGridSpacing || 1, 0.1);
  const planGridSize = Math.max(roomWidth, roomDepth);
  const planGridDivisions = Math.max(1, Math.round(planGridSize / planGridSpacing));
  const frontWallOpacity = Math.min(1, Math.max(0, config.frontWallOpacity ?? 1));
  const doorWidth = config.roomDoorWidth || 1;
  const doorHeight = config.roomDoorHeight || 2.1;
  const doorOffset = config.roomDoorOffset || 0;
  const doorThickness = Math.max(wallThickness * 0.6, 0.05);
  const doorAngle = config.roomDoorOpen
    ? THREE.MathUtils.degToRad(config.roomDoorOpenAngle || 0)
    : 0;
  
  return (
    <group position={position}>
      {/* Sol du local */}
      <mesh
        position={[0, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <boxGeometry args={[roomWidth, roomDepth, 0.1]} />
        <meshStandardMaterial
          color={config.floorColor}
          roughness={0.9}
          metalness={0.1}
        />
      </mesh>

      {/* Quadrillage du plan */}
      {config.planGridEnabled && (
        <gridHelper
          args={[planGridSize, planGridDivisions, config.planGridColor, config.planGridColor]}
          position={[0, 0.051, 0]}
        />
      )}
      
      {/* Murs */}
      {/* Mur arrière */}
      <mesh
        position={[0, roomHeight / 2, -roomDepth / 2]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[roomWidth, roomHeight, wallThickness]} />
        <meshStandardMaterial
          color={config.wallColor}
          roughness={0.8}
        />
      </mesh>
      
      {/* Mur gauche */}
      <mesh
        position={[-roomWidth / 2, roomHeight / 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[roomDepth, roomHeight, wallThickness]} />
        <meshStandardMaterial
          color={config.wallColor}
          roughness={0.8}
        />
      </mesh>
      
      {/* Mur droit */}
      <mesh
        position={[roomWidth / 2, roomHeight / 2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[roomDepth, roomHeight, wallThickness]} />
        <meshStandardMaterial
          color={config.wallColor}
          roughness={0.8}
        />
      </mesh>

      {/* Mur avant (translucide pour laisser voir la scène) */}
      {config.showFrontWall && (
        <mesh
          position={[0, roomHeight / 2, roomDepth / 2]}
          receiveShadow
          castShadow
        >
          <boxGeometry args={[roomWidth, roomHeight, wallThickness]} />
          <meshStandardMaterial
            color={config.wallColor}
            roughness={0.8}
            transparent={frontWallOpacity < 1}
            opacity={frontWallOpacity}
          />
        </mesh>
      )}

      {/* Porte du local */}
      {config.roomDoorEnabled && (
        <group position={[
          (config.roomDoorOffset ?? 0) - doorWidth / 2,
          doorHeight / 2 + (config.roomDoorOffsetY ?? 0),
          roomDepth / 2 + wallThickness / 2 + (config.roomDoorOffsetZ ?? 0)
        ]}>
          <group rotation={[0, -doorAngle, 0]}>
            <mesh castShadow receiveShadow position={[doorWidth / 2, 0, 0]}>
              <boxGeometry args={[doorWidth, doorHeight, doorThickness]} />
              <meshStandardMaterial
                color={config.roomDoorColor}
                roughness={0.6}
                metalness={0.2}
              />
            </mesh>
            {/* Poignée de porte */}
            <mesh position={[doorWidth * 0.8, 0, doorThickness / 2 + 0.01]} castShadow>
              <cylinderGeometry args={[0.025, 0.025, 0.05, 16]} />
              <meshStandardMaterial
                color="#fbbf24"
                metalness={0.9}
                roughness={0.1}
              />
            </mesh>
          </group>
        </group>
      )}
      
      {/* Plafond */}
      <mesh
        position={[0, roomHeight, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <boxGeometry args={[roomWidth, roomDepth, 0.1]} />
        <meshStandardMaterial
          color={config.ceilingColor}
          roughness={0.9}
        />
      </mesh>
      
      {/* Panneau du local */}
      <mesh position={[0, roomHeight + 0.2, -roomDepth / 2 + 0.1]}>
        <planeGeometry args={[1, 0.3]} />
        <meshStandardMaterial color="#7c3aed" />
      </mesh>
      
      {/* Armoires dans le local */}
      {localArmoires.map((armoire, i) => {
        const col = i % armoiresPerRow;
        const xPos = config.armoireBaseXOffset + (col - (armoiresPerRow - 1) / 2) * armoireSpacing;
        const zPos = -roomDepth / 2 + wallThickness + (config.armoireBackOffset ?? 0.8) + (config.armoireOffsetZ ?? 0);
        
        return (
          <Cabinet
            key={armoire.id}
            position={[xPos, 0.3 + (config.armoireOffsetY ?? 0), zPos]}
            armoire={armoire}
            etageres={etageres}
            boites={boites}
            archives={archives}
            config={config}
            isSelected={selectedArmoireId === armoire.id}
            selectedEtagereId={selectedEtagereId}
            selectedBoiteId={selectedBoiteId}
            openBoites={openBoites}
            selectedDossierId={selectedDossierId}
            onArmoireClick={() => onArmoireClick(armoire)}
            onEtagereClick={onEtagereClick}
            onBoiteClick={onBoiteClick}
            onDossierClick={onDossierClick}
          />
        );
      })}
    </group>
  );
};

// Composant principal de la scène
const Scene: React.FC<SceneProps & {
  selectedArmoireId?: string | null;
  selectedEtagereId?: string | null;
  selectedBoiteId?: string | null;
  openBoites: Set<string>;
  selectedDossierId?: string | null;
  onArmoireClick: (armoire: Armoire) => void;
  onEtagereClick: (etagere: Etagere) => void;
  onBoiteClick: (boite: BoiteArchive) => void;
  onDossierClick: (archive: Archive) => void;
}> = ({ locaux, armoires, etageres, boites, archives = [], selectedLocalId, config, selectedArmoireId, selectedEtagereId, selectedBoiteId, openBoites, selectedDossierId, onArmoireClick, onEtagereClick, onBoiteClick, onDossierClick }) => {
  const locauxToShow = selectedLocalId
    ? locaux.filter(l => l.id === selectedLocalId)
    : locaux;
  
  return (
    <>
      {/* Sol global */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial
          color="#f9fafb"
          roughness={0.9}
        />
      </mesh>
      
      {/* Locaux */}
      {locauxToShow.map((local, i) => {
        const xPos = (i - (locauxToShow.length - 1) / 2) * 8;
        return (
          <StorageRoom
            key={local.id}
            position={[xPos, 0, 0]}
            local={local}
            armoires={armoires}
            etageres={etageres}
            boites={boites}
            archives={archives}
            config={config}
            selectedArmoireId={selectedArmoireId}
            selectedEtagereId={selectedEtagereId}
            selectedBoiteId={selectedBoiteId}
            openBoites={openBoites}
            selectedDossierId={selectedDossierId}
            onArmoireClick={onArmoireClick}
            onEtagereClick={onEtagereClick}
            onBoiteClick={onBoiteClick}
            onDossierClick={onDossierClick}
          />
        );
      })}
    </>
  );
};

// Composant principal
const Archive3DView: React.FC<Archive3DViewProps> = (props) => {
  const [error, setError] = React.useState<string | null>(null);
  const [selectedArmoireId, setSelectedArmoireId] = React.useState<string | null>(props.selectedArmoireId || null);
  const [selectedEtagereId, setSelectedEtagereId] = React.useState<string | null>(props.selectedEtagereId || null);
  const [selectedBoiteId, setSelectedBoiteId] = React.useState<string | null>(props.selectedBoiteId || null);
  const [openBoites, setOpenBoites] = React.useState<Set<string>>(new Set());
  const [selectedDossierId, setSelectedDossierId] = React.useState<string | null>(null);
  const [selectedArchive, setSelectedArchive] = React.useState<Archive | null>(null);
  const [selectedCourrier, setSelectedCourrier] = React.useState<Courrier | null>(null);
  const [dossiersFichiers, setDossiersFichiers] = React.useState<CategorieFichier[]>([]);
  const [expandedDossiers, setExpandedDossiers] = React.useState<Set<string>>(new Set());
  const [showDrawer, setShowDrawer] = React.useState(false);
  
  const config = React.useMemo(
    () => normalizeConfig(props.config),
    [props.config]
  );

  // Synchroniser avec les props externes
  React.useEffect(() => {
    if (props.selectedArmoireId !== undefined && props.selectedArmoireId !== selectedArmoireId) {
      setSelectedArmoireId(props.selectedArmoireId);
    }
  }, [props.selectedArmoireId, selectedArmoireId]);

  React.useEffect(() => {
    if (props.selectedEtagereId !== undefined && props.selectedEtagereId !== selectedEtagereId) {
      setSelectedEtagereId(props.selectedEtagereId);
    }
  }, [props.selectedEtagereId, selectedEtagereId]);

  React.useEffect(() => {
    if (props.selectedBoiteId !== undefined && props.selectedBoiteId !== selectedBoiteId) {
      setSelectedBoiteId(props.selectedBoiteId);
      if (props.selectedBoiteId) {
        const newOpenBoites = new Set(openBoites);
        newOpenBoites.add(props.selectedBoiteId);
        setOpenBoites(newOpenBoites);
      } else {
        setOpenBoites(new Set());
      }
    }
  }, [props.selectedBoiteId, selectedBoiteId, openBoites]);

  React.useEffect(() => {
    if (props.selectedCourrierId) {
      const courrier = courrierService.getCourrierById(props.selectedCourrierId);
      if (courrier) {
        setSelectedCourrier(courrier);
        const loadDossiers = async () => {
          const dossiers = await categorieFichierService.getCategoriesFichiersByCourrier(courrier.id);
          setDossiersFichiers(dossiers);
        };
        loadDossiers();
      }
    }
  }, [props.selectedCourrierId]);

  React.useEffect(() => {
    // Vérifier que les dépendances sont disponibles
    try {
      if (typeof window === 'undefined') {
        setError('Environnement non supporté');
        return;
      }
    } catch (err) {
      setError('Erreur lors du chargement de la vue 3D');
      console.error('Archive3DView error:', err);
    }
  }, []);

  const handleArmoireClick = (armoire: Armoire) => {
    setSelectedArmoireId(armoire.id === selectedArmoireId ? null : armoire.id);
    setSelectedEtagereId(null);
    setSelectedBoiteId(null);
    setOpenBoites(new Set());
    setSelectedDossierId(null);
    // Ne pas forcer l'ouverture du drawer, laisser l'utilisateur décider
    props.onSelectArmoire?.(armoire);
  };

  const handleEtagereClick = (etagere: Etagere) => {
    setSelectedEtagereId(etagere.id === selectedEtagereId ? null : etagere.id);
    setSelectedBoiteId(null);
    setOpenBoites(new Set());
    setSelectedDossierId(null);
    // Ne pas forcer l'ouverture du drawer, laisser l'utilisateur décider
    props.onSelectEtagere?.(etagere);
  };

  const handleBoiteClick = (boite: BoiteArchive) => {
    setSelectedBoiteId(boite.id === selectedBoiteId ? null : boite.id);
    const newOpenBoites = new Set(openBoites);
    if (newOpenBoites.has(boite.id)) {
      newOpenBoites.delete(boite.id);
    } else {
      newOpenBoites.add(boite.id);
    }
    setOpenBoites(newOpenBoites);
    setSelectedDossierId(null);
    // Ne pas forcer l'ouverture du drawer, laisser l'utilisateur décider
    props.onSelectBoite?.(boite);
  };

  const handleDossierClick = async (archive: Archive) => {
    setSelectedArchive(archive);
    const courrier = archive.courrierId ? courrierService.getCourrierById(archive.courrierId) : undefined;
    if (courrier) {
      setSelectedCourrier(courrier);
      const dossiers = await categorieFichierService.getCategoriesFichiersByCourrier(courrier.id);
      setDossiersFichiers(dossiers);
      if (dossiers.length > 0) {
        props.onSelectDossier?.(dossiers[0], courrier);
      }
      props.onSelectCourrier?.(courrier);
    }
    // Ne pas forcer l'ouverture du drawer, laisser l'utilisateur décider
  };

  const renderTree = (): React.ReactNode => {
    if (!selectedCourrier) return null;
    
    const allItems = dossiersFichiers;
    const childrenMap = new Map<string, CategorieFichier[]>();
    
    allItems.forEach(item => {
      if (!item.parentId) {
        if (!childrenMap.has('root')) {
          childrenMap.set('root', []);
        }
        childrenMap.get('root')!.push(item);
      } else {
        if (!childrenMap.has(item.parentId)) {
          childrenMap.set(item.parentId, []);
        }
        childrenMap.get(item.parentId)!.push(item);
      }
    });
    
    const renderItem = (item: CategorieFichier, currentLevel: number = 0): React.ReactNode => {
      const isExpanded = expandedDossiers.has(`folder-${item.id}`);
      const itemChildren = childrenMap.get(item.id) || [];
      const hasChildren = itemChildren.length > 0;
      
      if (item.type === 'categorie') {
        return (
          <div key={item.id} className="py-1">
            <div
              className="flex items-center gap-2 text-sm p-2 rounded transition-colors cursor-pointer hover:bg-gray-50"
              style={{ paddingLeft: `${currentLevel * 24}px` }}
              onClick={() => {
                const key = `folder-${item.id}`;
                setExpandedDossiers(prev => {
                  const newSet = new Set(prev);
                  if (newSet.has(key)) {
                    newSet.delete(key);
                  } else {
                    newSet.add(key);
                  }
                  return newSet;
                });
              }}
            >
              <FontAwesomeIcon 
                icon={isExpanded ? faChevronDown : faChevronRight} 
                className="text-xs text-gray-500 w-3" 
              />
              <FontAwesomeIcon 
                icon={isExpanded ? faFolderOpen : faFolder} 
                className="text-yellow-600 text-base" 
              />
              <span className="text-gray-700 font-medium flex-1">{item.nom}</span>
            </div>
            {hasChildren && isExpanded && (
              <div>
                {itemChildren.map(child => renderItem(child, currentLevel + 1))}
              </div>
            )}
          </div>
        );
      } else {
        return (
          <div
            key={item.id}
            className="flex items-center gap-2 text-sm p-2 rounded transition-colors hover:bg-gray-50 cursor-pointer"
            style={{ paddingLeft: `${(currentLevel + 1) * 24}px` }}
            onClick={() => setSelectedDossierId(item.id)}
          >
            <FontAwesomeIcon icon={faFile} className="text-blue-600 text-base" />
            <span className="text-gray-700">{item.nom}</span>
          </div>
        );
      }
    };
    
    const rootItems = childrenMap.get('root') || [];
    return (
      <div className="space-y-1">
        {rootItems.map(item => renderItem(item))}
      </div>
    );
  };

  if (error) {
    return (
      <div className="w-full h-[700px] bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl overflow-hidden border border-surface-200 flex items-center justify-center">
        <div className="text-surface-600 text-center">
          <p className="text-lg font-semibold mb-2">Erreur de chargement</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const selectedArmoire = props.armoires.find(a => a.id === selectedArmoireId);
  const selectedEtagere = props.etageres.find(e => e.id === selectedEtagereId);
  const selectedBoite = props.boites.find(b => b.id === selectedBoiteId);
  
  // Récupérer tous les courriers archivés dans la boîte sélectionnée
  const courriersInBoite = selectedBoite && props.archives
    ? props.archives
        .filter(a => a.boiteId === selectedBoite.id)
        .map(a => {
          const courrier = a.courrierId ? courrierService.getCourrierById(a.courrierId) : undefined;
          return courrier ? { archive: a, courrier } : null;
        })
        .filter((item): item is { archive: Archive; courrier: Courrier } => item !== null)
    : [];

  const hasSelection = selectedArmoireId || selectedEtagereId || selectedBoiteId || selectedCourrier;

  return (
    <>
      <div className="relative w-full h-[700px] bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl overflow-hidden border border-surface-200">
        <Suspense fallback={
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-surface-600">Chargement de la vue 3D...</div>
          </div>
        }>
          <Canvas
            shadows
            gl={{ antialias: true }}
            camera={{ position: [15, 10, 15], fov: 50 }}
          >
            <ambientLight intensity={config.ambientLightIntensity} />
            <directionalLight
              position={[10, 10, 5]}
              intensity={config.directionalLightIntensity}
              castShadow
              shadow-mapSize-width={2048}
              shadow-mapSize-height={2048}
              shadow-camera-far={50}
              shadow-camera-left={-10}
              shadow-camera-right={10}
              shadow-camera-top={10}
              shadow-camera-bottom={-10}
            />
            <pointLight position={[-10, 10, -5]} intensity={0.5} />
            <OrbitControls
              enablePan={true}
              enableZoom={true}
              enableRotate={true}
              minDistance={5}
              maxDistance={50}
              minPolarAngle={0}
              maxPolarAngle={Math.PI / 2}
            />
            <Scene 
              {...props} 
              config={config}
              selectedArmoireId={selectedArmoireId}
              selectedEtagereId={selectedEtagereId}
              selectedBoiteId={selectedBoiteId}
              openBoites={openBoites}
              selectedDossierId={selectedDossierId}
              onArmoireClick={handleArmoireClick}
              onEtagereClick={handleEtagereClick}
              onBoiteClick={handleBoiteClick}
              onDossierClick={handleDossierClick}
            />
          </Canvas>
        </Suspense>
        
        {/* Bouton pour ouvrir/fermer le drawer */}
        {hasSelection && (
          <button
            onClick={() => setShowDrawer(!showDrawer)}
            className={`absolute top-4 right-4 z-20 w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg hover:shadow-xl transition-all flex items-center justify-center ${
              showDrawer ? 'bg-gradient-to-r from-gray-500 to-gray-600' : ''
            }`}
            title={showDrawer ? "Fermer les détails" : "Ouvrir les détails"}
          >
            {showDrawer ? (
              <FontAwesomeIcon icon={faChevronRight} className="w-5 h-5" />
            ) : (
              <FontAwesomeIcon icon={faInfoCircle} className="w-5 h-5" />
            )}
            {!showDrawer && hasSelection && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-xs font-bold">
                !
              </span>
            )}
          </button>
        )}
      </div>
      
      {/* Drawer des détails */}
      {showDrawer && hasSelection && (
        <div className="fixed inset-0 z-[20002] flex justify-end">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
            onClick={() => setShowDrawer(false)} 
          />
          <div className="relative h-full w-full max-w-md bg-white shadow-2xl border-l border-surface-200 flex flex-col animate-slideInRight">
            {/* Header */}
            <div className="px-6 py-4 border-b border-surface-200 bg-gradient-to-r from-blue-500 to-cyan-500">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-bold text-lg">Détails</h3>
                <button
                  onClick={() => setShowDrawer(false)}
                  className="text-white hover:text-gray-200 transition-colors w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/20"
                  title="Fermer"
                >
                  <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {/* Contenu */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Détails de l'armoire */}
              {selectedArmoire && (
                <div className="bg-surface-50 rounded-xl p-4 border border-surface-200">
                  <div className="flex items-center gap-3 mb-3">
                    <FontAwesomeIcon icon={faWarehouse} className="w-6 h-6 text-purple-600" />
                    <h4 className="font-bold text-surface-900">Armoire</h4>
                  </div>
                  <div className="space-y-2 text-sm">
                    <p><span className="font-semibold">Nom:</span> {selectedArmoire.nom}</p>
                    <p><span className="font-semibold">Code:</span> {selectedArmoire.code}</p>
                    <p><span className="font-semibold">Position:</span> {selectedArmoire.position}</p>
                  </div>
                </div>
              )}
              
              {/* Détails de l'étagère */}
              {selectedEtagere && (
                <div className="bg-surface-50 rounded-xl p-4 border border-surface-200">
                  <div className="flex items-center gap-3 mb-3">
                    <FontAwesomeIcon icon={faLayerGroup} className="w-6 h-6 text-blue-600" />
                    <h4 className="font-bold text-surface-900">Étagère</h4>
                  </div>
                  <div className="space-y-2 text-sm">
                    <p><span className="font-semibold">Nom:</span> {selectedEtagere.nom}</p>
                    <p><span className="font-semibold">Numéro:</span> {selectedEtagere.numero}</p>
                    {selectedEtagere.description && (
                      <p><span className="font-semibold">Description:</span> {selectedEtagere.description}</p>
                    )}
                  </div>
                </div>
              )}
              
              {/* Détails de la boîte */}
              {selectedBoite && (
                <div className="bg-surface-50 rounded-xl p-4 border border-surface-200">
                  <div className="flex items-center gap-3 mb-3">
                    <FontAwesomeIcon icon={faBox} className="w-6 h-6 text-orange-600" />
                    <h4 className="font-bold text-surface-900">Boîte</h4>
                  </div>
                  <div className="space-y-2 text-sm">
                    <p><span className="font-semibold">Numéro:</span> {selectedBoite.numero}</p>
                    <p><span className="font-semibold">Code:</span> {selectedBoite.code}</p>
                    <p><span className="font-semibold">Type:</span> {selectedBoite.typeContenu || 'N/A'}</p>
                    <p><span className="font-semibold">Statut:</span> {selectedBoite.estPleine ? 'Pleine' : 'Vide'}</p>
                  </div>
                </div>
              )}
              
              {/* Sélection du courrier */}
              {selectedBoite && courriersInBoite.length > 0 && (
                <div className="bg-surface-50 rounded-xl p-4 border border-surface-200">
                  <div className="flex items-center gap-3 mb-3">
                    <FontAwesomeIcon icon={faFileAlt} className="w-6 h-6 text-green-600" />
                    <h4 className="font-bold text-surface-900">Courriers archivés</h4>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {courriersInBoite.map(({ archive, courrier }) => (
                      <div
                        key={courrier.id}
                        onClick={async () => {
                          setSelectedCourrier(courrier);
                          const dossiers = await categorieFichierService.getCategoriesFichiersByCourrier(courrier.id);
                          setDossiersFichiers(dossiers);
                          props.onSelectCourrier?.(courrier);
                        }}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedCourrier?.id === courrier.id
                            ? 'bg-blue-50 border-blue-300'
                            : 'bg-white border-surface-200 hover:bg-surface-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <FontAwesomeIcon 
                            icon={faFolder} 
                            className={`w-8 h-8 ${
                              selectedCourrier?.id === courrier.id ? 'text-blue-600' : 'text-yellow-600'
                            }`} 
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-surface-900 truncate">{courrier.numero}</p>
                            <p className="text-xs text-surface-600 truncate">{courrier.objet?.replace(/<[^>]*>/g, '') || ''}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Arborescence des dossiers */}
              {selectedCourrier && (
                <div className="bg-surface-50 rounded-xl p-4 border border-surface-200">
                  <div className="flex items-center gap-3 mb-3">
                    <FontAwesomeIcon icon={faFolder} className="w-6 h-6 text-yellow-600" />
                    <h4 className="font-bold text-surface-900">Contenu du courrier</h4>
                  </div>
                  <div className="space-y-2 text-sm mb-3">
                    <p><span className="font-semibold">Numéro:</span> {selectedCourrier.numero}</p>
                    <p><span className="font-semibold">Objet:</span> {selectedCourrier.objet?.replace(/<[^>]*>/g, '') || ''}</p>
                  </div>
                  <div className="border-t border-surface-200 pt-3 mt-3">
                    <h5 className="font-semibold text-surface-700 mb-2">Arborescence</h5>
                    <div className="max-h-64 overflow-y-auto">
                      {renderTree()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Archive3DView;

