<?php
namespace App\Services;

use App\Models\Config;
use Illuminate\Validation\ValidationException;

/** Les champs obligatoires proviennent du formulaire publié dans Paramétrages. */
class CourrierFormValidationService
{
    public function validate(array $input, ?array $existing = null, string $prefix = ''): void
    {
        $data = array_replace($existing ?? [], $input);
        $config = Config::getValue('formulaire', []);
        $sens = $data['sens'] ?? 'ENTRANT';
        $type = $data['type'] ?? 'EXTERNE';
        $sections = $config[$sens][$type] ?? $config[$type] ?? [];
        $extra = $data['extraFields'] ?? [];
        if (is_string($extra)) $extra = json_decode($extra, true) ?: [];
        $errors = [];
        foreach ($sections as $section) foreach ($section['columns'] ?? [] as $column) foreach ($column['fields'] ?? [] as $field) {
            $name = $field['name'] ?? '';
            if (!$name || empty($field['required'])) continue;
            $value = $data[$name] ?? $extra[$name] ?? null;
            if ($value === null || (is_string($value) && trim($value) === '') || (is_array($value) && !$value)) {
                $errors[$prefix.$name] = ($field['label'] ?? $name).' est obligatoire.';
            }
        }
        if ($errors) throw ValidationException::withMessages($errors);
    }
}
