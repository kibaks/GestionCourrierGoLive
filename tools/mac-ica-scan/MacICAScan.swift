//
// MacICAScan.swift
//
// Outil CLI pour macOS utilisant ImageCaptureCore (ICA).
// Compatible avec Canon imageRUNNER et autres scanners réseau.
//
// Compile: swiftc -o mac-ica-scan MacICAScan.swift -framework ImageCaptureCore
//

import Foundation
import ImageCaptureCore

// MARK: - Modèles

struct CLIArgs {
    var list: Bool = false
    var listJSON: Bool = false
    var scan: Bool = false
    var deviceName: String?
    var outputPath: String?
    var dpi: Int = 300
    var color: Bool = true
}

// MARK: - Parsing des arguments

func parseArgs() -> CLIArgs {
    var result = CLIArgs()
    let args = CommandLine.arguments.dropFirst()
    var it = args.makeIterator()
    while let arg = it.next() {
        switch arg {
        case "--help", "-h":
            print("""
            Usage:
              mac-ica-scan --list              Liste les scanners (texte)
              mac-ica-scan --list-json         Liste les scanners (JSON)
              mac-ica-scan --scan --device "Nom" --out /tmp/scan.jpg [--dpi 300] [--gray]
            """)
            exit(0)
        case "--list":
            result.list = true
        case "--list-json":
            result.list = true
            result.listJSON = true
        case "--scan":
            result.scan = true
        case "--device":
            result.deviceName = it.next()
        case "--out":
            result.outputPath = it.next()
        case "--dpi":
            if let v = it.next(), let d = Int(v) {
                result.dpi = d
            }
        case "--color":
            result.color = true
        case "--gray", "--grey":
            result.color = false
        default:
            break
        }
    }
    if !result.list && !result.scan {
        result.list = true
    }
    return result
}

// MARK: - Délégué de découverte

final class BrowserDelegate: NSObject, ICDeviceBrowserDelegate {
    private let onDeviceFound: (ICDevice) -> Void
    private let onDone: () -> Void

    init(onDeviceFound: @escaping (ICDevice) -> Void, onDone: @escaping () -> Void) {
        self.onDeviceFound = onDeviceFound
        self.onDone = onDone
    }

    func deviceBrowser(_ browser: ICDeviceBrowser,
                       didAdd device: ICDevice,
                       moreComing: Bool) {
        onDeviceFound(device)
        if !moreComing {
            onDone()
        }
    }

    func deviceBrowser(_ browser: ICDeviceBrowser,
                       didRemove device: ICDevice,
                       moreGoing: Bool) {
        // Ignoré
    }
}

// MARK: - Délégué de scan

final class ScanDelegate: NSObject, ICScannerDeviceDelegate, ICDeviceDelegate {
    private let done: DispatchSemaphore
    private let outputURL: URL
    private var lastError: Error?

    init(done: DispatchSemaphore, outputURL: URL) {
        self.done = done
        self.outputURL = outputURL
        super.init()
    }

    // ICDeviceDelegate - une seule implémentation de chaque méthode
    func device(_ device: ICDevice, didOpenSessionWithError error: Error?) {
        if let err = error {
            lastError = err
            done.signal()
        }
    }

    func device(_ device: ICDevice, didCloseSessionWithError error: Error?) {
        if let err = error {
            lastError = err
        }
        done.signal()
    }

    func didRemove(_ device: ICDevice) {
        // Ignoré
    }

    // ICScannerDeviceDelegate
    func scannerDevice(_ scanner: ICScannerDevice,
                       didSelect functionalUnit: ICScannerFunctionalUnit,
                       error: Error?) {
        if let err = error {
            lastError = err
            done.signal()
            return
        }

        // Configuration du scan
        scanner.transferMode = .fileBased
        scanner.downloadsDirectory = outputURL.deletingLastPathComponent()
        scanner.documentName = outputURL.deletingPathExtension().lastPathComponent

        // Configuration de la résolution
        let fu = scanner.selectedFunctionalUnit
        fu.resolution = 300

        scanner.requestScan()
    }

    func scannerDevice(_ scanner: ICScannerDevice,
                       didScanTo url: URL,
                       data: Data?,
                       error: Error?) {
        if let err = error {
            lastError = err
        } else {
            // Déplacer le fichier vers la destination finale
            if url.path != outputURL.path {
                do {
                    let fm = FileManager.default
                    if fm.fileExists(atPath: outputURL.path) {
                        try fm.removeItem(at: outputURL)
                    }
                    try fm.moveItem(at: url, to: outputURL)
                } catch {
                    lastError = error
                }
            }
        }
        done.signal()
    }

    func scannerDevice(_ scanner: ICScannerDevice,
                       didCompleteScanWithError error: Error?) {
        if let err = error {
            lastError = err
        }
        done.signal()
    }

    func getError() -> Error? {
        return lastError
    }
}

// MARK: - Fonctions principales

func listScanners(asJSON: Bool) {
    let group = DispatchGroup()
    group.enter()
    var scanners: [ICScannerDevice] = []

    let browser = ICDeviceBrowser()
    let delegate = BrowserDelegate(
        onDeviceFound: { device in
            if let scanner = device as? ICScannerDevice {
                scanners.append(scanner)
            }
        },
        onDone: {
            group.leave()
        }
    )

    browser.delegate = delegate
    browser.browsedDeviceTypeMask = ICDeviceTypeMask(rawValue: ICDeviceTypeMask.scanner.rawValue)!
    browser.start()

    _ = group.wait(timeout: .now() + 5)
    browser.stop()

    if asJSON {
        let mapped: [[String: Any]] = scanners.map { d in
            [
                "name": d.name ?? "Sans nom",
                "uuid": d.uuidString ?? "",
                "transport": d.transportType ?? "Network/Other"
            ]
        }
        if let json = try? JSONSerialization.data(withJSONObject: mapped, options: .prettyPrinted) {
            FileHandle.standardOutput.write(json)
        } else {
            print("[]")
        }
    } else {
        if scanners.isEmpty {
            print("Aucun scanner ICA détecté.")
        } else {
            for d in scanners {
                let name = d.name ?? "Sans nom"
                let transport = d.transportType ?? "Réseau/Autre"
                print("📷 \(name) – transport: \(transport)")
            }
        }
    }
}

func performScan(args: CLIArgs) {
    guard let deviceName = args.deviceName, !deviceName.isEmpty else {
        fputs("Erreur: Paramètre --device manquant\n", stderr)
        exit(1)
    }
    guard let outPath = args.outputPath, !outPath.isEmpty else {
        fputs("Erreur: Paramètre --out manquant\n", stderr)
        exit(1)
    }

    let outputURL = URL(fileURLWithPath: outPath)

    // Créer le répertoire de sortie si nécessaire
    let outputDir = outputURL.deletingLastPathComponent()
    try? FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)

    // Découverte du scanner
    let browser = ICDeviceBrowser()
    var target: ICScannerDevice?
    let group = DispatchGroup()
    group.enter()

    let delegate = BrowserDelegate(
        onDeviceFound: { device in
            if let scanner = device as? ICScannerDevice,
               let name = scanner.name,
               name == deviceName {
                target = scanner
            }
        },
        onDone: {
            group.leave()
        }
    )

    browser.delegate = delegate
    browser.browsedDeviceTypeMask = ICDeviceTypeMask(rawValue: ICDeviceTypeMask.scanner.rawValue)!
    browser.start()
    _ = group.wait(timeout: .now() + 5)
    browser.stop()

    guard let scanner = target else {
        fputs("Erreur: Scanner '\(deviceName)' introuvable via ICA\n", stderr)
        exit(1)
    }

    // Exécution du scan
    let done = DispatchSemaphore(value: 0)
    let scanDelegate = ScanDelegate(done: done, outputURL: outputURL)
    scanner.delegate = scanDelegate

    // Ouvrir la session et lancer le scan
    scanner.requestOpenSession()
    _ = done.wait(timeout: .now() + 60)

    // Vérification des erreurs
    if let err = scanDelegate.getError() {
        fputs("Erreur lors du scan: \(err.localizedDescription)\n", stderr)
        exit(1)
    }

    if !FileManager.default.fileExists(atPath: outputURL.path) {
        fputs("Erreur: Le fichier de sortie n'a pas été créé\n", stderr)
        exit(1)
    }

    print("✅ Scan réussi: \(outputURL.path)")
    exit(0)
}

// MARK: - Point d'entrée

let cli = parseArgs()

if cli.list {
    listScanners(asJSON: cli.listJSON)
    exit(0)
}

if cli.scan {
    performScan(args: cli)
}

// Fallback: liste par défaut
listScanners(asJSON: false)

