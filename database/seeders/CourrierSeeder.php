<?php

namespace Database\Seeders;

use App\Models\Courrier;
use App\Models\CourrierFichier;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Crée 1000 courriers de démonstration avec fichiers PDF associés.
 * À exécuter après DatabaseSeeder.
 */
class CourrierSeeder extends Seeder
{
    private const OBJETS = [
        'Demande de pièces comptables',
        'Rapport mensuel de trésorerie',
        'Avis juridique - contrat cadre',
        'Commande de fournitures',
        'Demande d\'équipement',
        'Note de service',
        'Procès-verbal de réunion',
        'Demande de congé',
        'Rapport d\'activité',
        'Demande de budget',
        'Attestation de travail',
        'Note d\'information',
        'Décision administrative',
        'Plan d\'action annuel',
        'Rapport d\'audit',
        'Demande de régularisation',
        'Transmission de dossier',
        'Invitation à la réunion',
        'Rapport de mission',
        'Demande de partenariat',
    ];

    private const EXPEDITEURS_EXTERNE = [
        'Ministère des Finances', 'Banque Centrale du Congo', 'OIF', 'PNUD RDC',
        'Ambassade de France', 'Cellule du Cadre intégré renforcé', 'Société Minière KCS',
        'Congo Airways', 'SNEL', 'REGIDESO', 'Caisse Nationale de Sécurité Sociale',
        'BCDC', 'Rawbank', 'ECOBANK', 'Afriland First Bank', 'BGFI Bank',
        'CABEF', 'ACGT', 'SCTP', 'Office des Routes',
    ];

    private const DESTINATAIRES_INTERNE = [
        'Direction Administrative', 'Direction Financière', 'Direction Technique',
        'Direction Commerciale', 'Direction des Ressources Humaines', 'Direction Générale',
        'Service Comptabilité', 'Service Logistique', 'Service Informatique',
        'Service Juridique', 'Service Audit', 'Service Archives',
        'Division Informatique', 'Division Infrastructure', 'Division Sécurité',
    ];

    private const DIRECTIONS = [
        'Direction Administrative', 'Direction Financière', 'Direction Technique',
        'Direction Commerciale', 'Direction des Ressources Humaines',
    ];

    private const SERVICES = [
        'Service Comptabilité', 'Service Logistique', 'Service Informatique',
        'Service Juridique', 'Service Audit', 'Service Archives',
        'Service Recrutement', 'Service Paie', 'Service Commercial',
    ];

    private const PRIORITES = ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'];
    private const PRIORITE_WEIGHTS = [15, 45, 30, 10];
    private const STATUTS = ['ENREGISTRE', 'EN_ATTENTE_DG', 'TRAITE', 'EN_COURS', 'ARCHIVE'];
    private const STATUT_WEIGHTS = [50, 15, 15, 15, 5];

    public function run(): void
    {
        $admin = User::where('email', 'admin@example.com')->first()
            ?? User::where('role', 'SUPER_ADMIN')->first();

        if (!$admin) {
            $this->command->warn('Aucun utilisateur admin trouvé. Exécutez d\'abord DatabaseSeeder.');
            return;
        }

        $total = 1000;
        $chunkSize = 50;
        $created = 0;
        $year = now()->format('Y');
        $startSequence = (int) Courrier::where('numero', 'like', "EXT-{$year}-%")
            ->orWhere('numero', 'like', "INT-{$year}-%")
            ->count() + 1;

        $this->command->info("Création de {$total} courriers de démonstration avec fichiers...");

        for ($i = 0; $i < $total; $i += $chunkSize) {
            $batchCount = min($chunkSize, $total - $i);

            DB::transaction(function () use ($i, $batchCount, $admin, $year, $startSequence, &$created) {
                for ($j = 0; $j < $batchCount; $j++) {
                    $index = $i + $j;
                    $type = $index % 2 === 0 ? 'EXTERNE' : 'INTERNE';
                    $sens = $index % 4 < 2 ? 'ENTRANT' : 'SORTANT';
                    $prefix = $type === 'INTERNE' ? 'INT' : 'EXT';
                    $numero = sprintf('%s-%d-%04d', $prefix, $year, $startSequence + $index);

                    $expediteur = $sens === 'ENTRANT'
                        ? $this->randomExterne($index)
                        : $this->randomInterne($index + 1);
                    $destinataire = $sens === 'SORTANT'
                        ? $this->randomExterne($index + 7)
                        : $this->randomInterne($index);

                    $dateReception = now()->subDays(rand(1, 365))->subMinutes(rand(0, 1440));
                    $dateEnregistrement = $dateReception->copy()->addMinutes(rand(5, 120));

                    $extraFields = $this->buildExtraFields($type, $sens, $dateReception, $index);

                    $courrier = Courrier::create([
                        'numero' => $numero,
                        'type' => $type,
                        'sens' => $sens,
                        'date_reception' => $dateReception,
                        'date_enregistrement' => $dateEnregistrement,
                        'expediteur' => $expediteur,
                        'destinataire' => $destinataire,
                        'objet' => $this->randomObjet($index),
                        'priorite' => $this->weightedRandom(self::PRIORITES, self::PRIORITE_WEIGHTS, $index),
                        'statut' => $this->weightedRandom(self::STATUTS, self::STATUT_WEIGHTS, $index),
                        'enregistre_par' => $admin->id,
                        'direction' => self::DIRECTIONS[$index % count(self::DIRECTIONS)],
                        'service' => self::SERVICES[$index % count(self::SERVICES)],
                        'fichier' => null,
                        'extra_fields' => $extraFields,
                    ]);

                    $this->createFilesForCourrier($courrier, $admin->id, $type, $sens, $index);
                    $created++;
                }
            });

            $this->command->info('  ' . min($i + $batchCount, $total) . " / {$total} courriers créés.");
        }

        $this->command->info("Total courriers créés : {$created}");
        $this->command->info('Total fichiers créés : ' . CourrierFichier::count());
    }

    private function randomObjet(int $index): string
    {
        $base = self::OBJETS[$index % count(self::OBJETS)];
        return $base . ' - ' . now()->format('Y') . '-' . sprintf('%04d', $index + 1);
    }

    private function randomExterne(int $index): string
    {
        return self::EXPEDITEURS_EXTERNE[$index % count(self::EXPEDITEURS_EXTERNE)];
    }

    private function randomInterne(int $index): string
    {
        return self::DESTINATAIRES_INTERNE[$index % count(self::DESTINATAIRES_INTERNE)];
    }

    private function weightedRandom(array $values, array $weights, int $index): string
    {
        $total = array_sum($weights);
        $rand = (($index * 9301 + 49297) % 233280) / 233280 * $total;
        $sum = 0;
        foreach ($values as $i => $value) {
            $sum += $weights[$i];
            if ($rand <= $sum) {
                return $value;
            }
        }
        return $values[0];
    }

    private function buildExtraFields(string $type, string $sens, $dateReception, int $index): array
    {
        $fields = [
            'dateReception' => $dateReception->toDateTimeString(),
            'objet' => $this->randomObjet($index),
            'expediteur' => $sens === 'ENTRANT' ? $this->randomExterne($index) : $this->randomInterne($index + 1),
            'destinataire' => $sens === 'SORTANT' ? $this->randomExterne($index + 7) : $this->randomInterne($index),
            'urgence' => (string) rand(1, 5),
        ];

        if ($type === 'EXTERNE') {
            $fields['referenceExterne'] = 'REF-' . strtoupper(Str::random(6)) . '-' . now()->format('Y');
        }

        if ($type === 'INTERNE') {
            $fields['contenu'] = 'Contenu détaillé du courrier interne généré pour les tests. Numéro ' . ($index + 1) . '.';
        }

        if ($sens === 'SORTANT') {
            $fields['hasAnnexe'] = rand(1, 100) <= 40 ? 'true' : 'false';
            if ($fields['hasAnnexe'] === 'true') {
                $fields['dateSignature'] = $dateReception->copy()->subDays(rand(0, 5))->toDateTimeString();
            }
        }

        return $fields;
    }

    private function createFilesForCourrier(Courrier $courrier, string $userId, string $type, string $sens, int $index): void
    {
        $dir = $courrier->id . '/fichiers';

        // Fichier principal
        $this->createPdfFile($courrier, $userId, $dir, 'Document principal', false);

        // Annexe pour environ 40% des courriers sortants avec hasAnnexe
        if ($sens === 'SORTANT' && rand(1, 100) <= 40) {
            $this->createPdfFile($courrier, $userId, $dir, 'Annexe ' . (rand(1, 3)), true);
        }

        // Pièce jointe supplémentaire aléatoire (10% de tous les courriers)
        if (rand(1, 100) <= 10) {
            $this->createPdfFile($courrier, $userId, $dir, 'Pièce complémentaire', true);
        }
    }

    private function createPdfFile(Courrier $courrier, string $userId, string $dir, string $baseName, bool $isAnnexe): CourrierFichier
    {
        $uuid = (string) Str::uuid();
        $safeBase = Str::slug(mb_substr($baseName, 0, 80));
        $filename = $uuid . '_' . $safeBase . '.pdf';
        $relativePath = $dir . '/' . $filename;

        $disk = Storage::disk('courrier_fichiers');
        $disk->put($relativePath, $this->minimalPdfContent($courrier->numero, $baseName));

        return CourrierFichier::create([
            'nom' => $baseName . '.pdf',
            'type' => 'fichier',
            'courrier_id' => $courrier->id,
            'parent_id' => null,
            'chemin' => $relativePath,
            'extension' => 'pdf',
            'taille' => $disk->size($relativePath),
            'est_accuse_reception' => false,
            'cree_par' => $userId,
        ]);
    }

    private function minimalPdfContent(string $numero, string $title): string
    {
        // Fichier .pdf de test : contenu texte simple (valide comme pièce jointe de démonstration)
        return "%PDF-1.4\n"
            . "%âãÏÓ\n"
            . "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
            . "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"
            . "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n"
            . "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n"
            . "5 0 obj << /Length 50 >> stream\n"
            . "BT /F1 12 Tf 100 700 Td (Courrier {$numero} - {$title}) Tj ET\n"
            . "endstream endobj\n"
            . "xref\n0 6\n"
            . "0000000000 65535 f \n"
            . "0000000015 00000 n \n"
            . "0000000066 00000 n \n"
            . "0000000123 00000 n \n"
            . "0000000294 00000 n \n"
            . "0000000392 00000 n \n"
            . "trailer\n<< /Size 6 /Root 1 0 R >>\n"
            . "startxref\n535\n"
            . "%%EOF";
    }
}
