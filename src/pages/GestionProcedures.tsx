import { MaterialDateTimeField } from '../components/MaterialDateTimeField';
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { procedureService } from '../services/procedureService';
import { userService } from '../services/userService';
import { Procedure, ProcedureEvent, ProcedureAction, Utilisateur, Role } from '../types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faPlus, 
  faEdit, 
  faTrash, 
  faSave, 
  faTimes, 
  faCalendar,
  faUsers,
  faClock,
  faCheckCircle,
  faExclamationTriangle,
  faInfoCircle,
  faChevronDown,
  faChevronRight,
  faGripVertical
} from '@fortawesome/free-solid-svg-icons';
import CustomDialog, { DialogOptions } from '../components/CustomDialog';

const GestionProcedures: React.FC = () => {
  const { user, hasRole } = useAuth();
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [selectedProcedure, setSelectedProcedure] = useState<Procedure | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ProcedureEvent | null>(null);
  const [editingAction, setEditingAction] = useState<ProcedureAction | null>(null);
  const [assignableUsers, setAssignableUsers] = useState<Utilisateur[]>([]);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  
  const [dialog, setDialog] = useState<DialogOptions & { isOpen: boolean }>({
    isOpen: false,
    message: '',
    type: 'info'
  });

  const showAlert = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', title?: string) => {
    setDialog({
      isOpen: true,
      message,
      type,
      title: title || (type === 'error' ? 'Erreur' : type === 'success' ? 'Succès' : type === 'warning' ? 'Attention' : 'Information'),
      confirmText: 'OK',
      cancelText: '',
      onConfirm: () => closeDialog(),
      onCancel: undefined
    });
  };

  const showConfirm = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'warning', title?: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialog({
        isOpen: true,
        message,
        type,
        title: title || 'Confirmation',
        confirmText: 'Confirmer',
        cancelText: 'Annuler',
        onConfirm: () => {
          closeDialog();
          resolve(true);
        },
        onCancel: () => {
          closeDialog();
          resolve(false);
        }
      });
    });
  };

  const closeDialog = () => {
    setDialog(prev => ({ ...prev, isOpen: false }));
  };

  useEffect(() => {
    if (hasRole(Role.DIRECTEUR_GENERAL) || hasRole(Role.SUPER_ADMIN) || hasRole(Role.SECRETAIRE)) {
      loadProcedures();
      loadUsers();
    }
  }, []);

  const loadProcedures = () => {
    const all = procedureService.getAllProcedures();
    setProcedures(all);
  };

  const loadUsers = () => {
    // Charger les utilisateurs visibles selon l'organigramme et le niveau d'accès
    if (user) {
      const visibleUsers = userService.getVisibleUsers(user.id);
      console.log('📋 GestionProcedures - Utilisateurs visibles chargés:', visibleUsers.length, 'pour', user.role);
      setAssignableUsers(visibleUsers);
    } else {
      // Si pas d'utilisateur connecté, retourner une liste vide
      console.warn('⚠️ GestionProcedures - Pas d\'utilisateur connecté');
      setAssignableUsers([]);
    }
  };

  const handleCreateProcedure = () => {
    setSelectedProcedure({
      id: '',
      nom: '',
      description: '',
      acteurs: [],
      evenements: [],
      dureeTotale: 0,
      dateCreation: new Date(),
      dateModification: new Date(),
      creePar: user!.id,
      actif: true
    });
    setShowEditModal(true);
  };

  const handleSaveProcedure = () => {
    if (!selectedProcedure || !selectedProcedure.nom.trim()) {
      showAlert('Veuillez saisir un nom pour la procédure', 'warning');
      return;
    }

    if (selectedProcedure.evenements.length === 0) {
      showAlert('Veuillez ajouter au moins un événement à la procédure', 'warning');
      return;
    }

    // Calculer la durée totale
    const dureeTotale = procedureService.calculateDureeTotale(selectedProcedure);
    selectedProcedure.dureeTotale = dureeTotale;

    if (selectedProcedure.id) {
      procedureService.updateProcedure(selectedProcedure.id, selectedProcedure);
    } else {
      procedureService.createProcedure(selectedProcedure);
    }

    loadProcedures();
    setShowEditModal(false);
    setSelectedProcedure(null);
    showAlert('Procédure enregistrée avec succès', 'success');
  };

  const handleDeleteProcedure = async (id: string) => {
    const confirmed = await showConfirm(
      'Êtes-vous sûr de vouloir supprimer cette procédure ?',
      'warning',
      'Confirmation de suppression'
    );
    if (confirmed) {
      procedureService.deleteProcedure(id);
      loadProcedures();
      showAlert('Procédure supprimée avec succès', 'success');
    }
  };

  const handleAddEvent = () => {
    setEditingEvent({
      id: `event-${Date.now()}`,
      nom: '',
      description: '',
      dateDebut: new Date(),
      dateFin: new Date(),
      actions: [],
      ordre: selectedProcedure!.evenements.length
    });
    setShowEventModal(true);
  };

  const handleSaveEvent = () => {
    if (!editingEvent || !editingEvent.nom.trim()) {
      showAlert('Veuillez saisir un nom pour l\'événement', 'warning');
      return;
    }

    if (!selectedProcedure) return;

    const events = [...selectedProcedure.evenements];
    const existingIndex = events.findIndex(e => e.id === editingEvent.id);
    
    if (existingIndex >= 0) {
      events[existingIndex] = editingEvent;
    } else {
      events.push(editingEvent);
    }

    setSelectedProcedure({
      ...selectedProcedure,
      evenements: events.sort((a, b) => a.ordre - b.ordre)
    });

    setShowEventModal(false);
    setEditingEvent(null);
  };

  const handleAddAction = (eventId: string) => {
    const event = selectedProcedure?.evenements.find(e => e.id === eventId);
    if (!event) return;

    setEditingAction({
      id: `action-${Date.now()}`,
      nom: '',
      description: '',
      dureeEstimee: 1,
      ordre: event.actions.length,
      type: 'MANUEL',
      instructions: ''
    });
    setShowActionModal(true);
  };

  const handleSaveAction = () => {
    if (!editingAction || !editingAction.nom.trim()) {
      showAlert('Veuillez saisir un nom pour l\'action', 'warning');
      return;
    }

    if (!selectedProcedure || !editingEvent) return;

    const event = selectedProcedure.evenements.find(e => e.id === editingEvent.id);
    if (!event) return;

    const actions = [...event.actions];
    const existingIndex = actions.findIndex(a => a.id === editingAction.id);
    
    if (existingIndex >= 0) {
      actions[existingIndex] = editingAction;
    } else {
      actions.push(editingAction);
    }

    event.actions = actions.sort((a, b) => a.ordre - b.ordre);

    setSelectedProcedure({
      ...selectedProcedure,
      evenements: selectedProcedure.evenements.map(e => 
        e.id === event.id ? event : e
      )
    });

    setShowActionModal(false);
    setEditingAction(null);
  };

  if (!hasRole(Role.DIRECTEUR_GENERAL) && !hasRole(Role.SUPER_ADMIN) && !hasRole(Role.SECRETAIRE)) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Vous n'avez pas accès à cette page</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gestion des procédures</h1>
          <p className="mt-2 text-gray-600">Créez et gérez les procédures de traitement des courriers</p>
        </div>
        <button
          onClick={handleCreateProcedure}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <FontAwesomeIcon icon={faPlus} />
          Nouvelle procédure
        </button>
      </div>

      {/* Liste des procédures */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {procedures.map((procedure) => (
          <div
            key={procedure.id}
            className="bg-white p-4 rounded-lg shadow border border-gray-200 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">{procedure.nom}</h3>
                {procedure.description && (
                  <p className="text-sm text-gray-600 mt-1">{procedure.description}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setSelectedProcedure(procedure);
                    setShowEditModal(true);
                  }}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                  title="Modifier"
                >
                  <FontAwesomeIcon icon={faEdit} />
                </button>
                <button
                  onClick={() => handleDeleteProcedure(procedure.id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded"
                  title="Supprimer"
                >
                  <FontAwesomeIcon icon={faTrash} />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <FontAwesomeIcon icon={faCalendar} />
                {procedure.evenements.length} événement(s)
              </span>
              <span className="flex items-center gap-1">
                <FontAwesomeIcon icon={faClock} />
                {procedure.dureeTotale}h
              </span>
              <span className="flex items-center gap-1">
                <FontAwesomeIcon icon={faUsers} />
                {procedure.acteurs.length} acteur(s)
              </span>
            </div>
            {!procedure.actif && (
              <div className="mt-2 text-xs text-red-600 flex items-center gap-1">
                <FontAwesomeIcon icon={faExclamationTriangle} />
                Procédure inactive
              </div>
            )}
          </div>
        ))}
        {procedures.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-500">
            <FontAwesomeIcon icon={faInfoCircle} className="text-4xl mb-2" />
            <p>Aucune procédure créée</p>
            <p className="text-sm mt-1">Cliquez sur "Nouvelle procédure" pour commencer</p>
          </div>
        )}
      </div>

      {/* Modal d'édition de procédure */}
      {showEditModal && selectedProcedure && (
        <ProcedureEditModal
          procedure={selectedProcedure}
          setProcedure={setSelectedProcedure}
          assignableUsers={assignableUsers}
          onClose={() => {
            setShowEditModal(false);
            setSelectedProcedure(null);
          }}
          onSave={handleSaveProcedure}
          onAddEvent={handleAddEvent}
          onEditEvent={(event) => {
            setEditingEvent(event);
            setShowEventModal(true);
          }}
          onDeleteEvent={(eventId) => {
            setSelectedProcedure({
              ...selectedProcedure,
              evenements: selectedProcedure.evenements.filter(e => e.id !== eventId)
            });
          }}
          onAddAction={handleAddAction}
          onEditAction={(action, eventId) => {
            setEditingEvent(selectedProcedure.evenements.find(e => e.id === eventId) || null);
            setEditingAction(action);
            setShowActionModal(true);
          }}
          onDeleteAction={(actionId, eventId) => {
            const event = selectedProcedure.evenements.find(e => e.id === eventId);
            if (event) {
              event.actions = event.actions.filter(a => a.id !== actionId);
              setSelectedProcedure({
                ...selectedProcedure,
                evenements: selectedProcedure.evenements.map(e => 
                  e.id === eventId ? event : e
                )
              });
            }
          }}
        />
      )}

      {/* Modal d'édition d'événement */}
      {showEventModal && editingEvent && (
        <EventEditModal
          event={editingEvent}
          setEvent={setEditingEvent}
          onClose={() => {
            setShowEventModal(false);
            setEditingEvent(null);
          }}
          onSave={handleSaveEvent}
        />
      )}

      {/* Modal d'édition d'action */}
      {showActionModal && editingAction && editingEvent && (
        <ActionEditModal
          action={editingAction}
          setAction={setEditingAction}
          assignableUsers={assignableUsers}
          onClose={() => {
            setShowActionModal(false);
            setEditingAction(null);
            setEditingEvent(null);
          }}
          onSave={handleSaveAction}
        />
      )}

      {/* Custom Dialog */}
      {dialog.isOpen && (
        <CustomDialog
          isOpen={dialog.isOpen}
          message={dialog.message}
          type={dialog.type}
          title={dialog.title}
          confirmText={dialog.confirmText}
          cancelText={dialog.cancelText}
          onConfirm={dialog.onConfirm}
          onCancel={dialog.onCancel}
          onClose={closeDialog}
        />
      )}
    </div>
  );
};

// Composant modal d'édition de procédure
const ProcedureEditModal: React.FC<{
  procedure: Procedure;
  setProcedure: (p: Procedure) => void;
  assignableUsers: Utilisateur[];
  onClose: () => void;
  onSave: () => void;
  onAddEvent: () => void;
  onEditEvent: (event: ProcedureEvent) => void;
  onDeleteEvent: (eventId: string) => void;
  onAddAction: (eventId: string) => void;
  onEditAction: (action: ProcedureAction, eventId: string) => void;
  onDeleteAction: (actionId: string, eventId: string) => void;
}> = ({
  procedure,
  setProcedure,
  assignableUsers,
  onClose,
  onSave,
  onAddEvent,
  onEditEvent,
  onDeleteEvent,
  onAddAction,
  onEditAction,
  onDeleteAction
}) => {
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[50000] overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full mx-4 my-8 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-900">
            {procedure.id ? 'Modifier la procédure' : 'Nouvelle procédure'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <FontAwesomeIcon icon={faTimes} className="text-xl" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Informations de base */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nom de la procédure *
            </label>
            <input
              type="text"
              value={procedure.nom}
              onChange={(e) => setProcedure({ ...procedure, nom: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Ex: Traitement courrier urgent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={procedure.description || ''}
              onChange={(e) => setProcedure({ ...procedure, description: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Description de la procédure..."
            />
          </div>

          {/* Acteurs */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Acteurs assignés à la procédure
            </label>
            <select
              multiple
              value={procedure.acteurs}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions, option => option.value);
                setProcedure({ ...procedure, acteurs: selected });
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[100px]"
            >
              {assignableUsers.map(user => (
                <option key={user.id} value={user.id}>
                  {user.nom} ({user.email}) - {user.role}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Maintenez Ctrl/Cmd pour sélectionner plusieurs acteurs
            </p>
          </div>

          {/* Événements */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700">
                Événements de la procédure
              </label>
              <button
                onClick={onAddEvent}
                className="flex items-center gap-2 px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
              >
                <FontAwesomeIcon icon={faPlus} />
                Ajouter un événement
              </button>
            </div>
            <div className="space-y-3">
              {procedure.evenements.map((event, index) => (
                <div key={event.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const newSet = new Set(expandedEvents);
                          if (newSet.has(event.id)) {
                            newSet.delete(event.id);
                          } else {
                            newSet.add(event.id);
                          }
                          setExpandedEvents(newSet);
                        }}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        <FontAwesomeIcon icon={expandedEvents.has(event.id) ? faChevronDown : faChevronRight} />
                      </button>
                      <span className="font-semibold text-gray-900">
                        Événement {index + 1}: {event.nom}
                      </span>
                      <span className="text-xs text-gray-500">
                        ({event.actions.length} action(s))
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onEditEvent(event)}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                        title="Modifier"
                      >
                        <FontAwesomeIcon icon={faEdit} />
                      </button>
                      <button
                        onClick={() => onDeleteEvent(event.id)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                        title="Supprimer"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </div>
                  </div>
                  {expandedEvents.has(event.id) && (
                    <div className="ml-6 mt-3 space-y-2">
                      {event.actions.map((action, actionIndex) => (
                        <div key={action.id} className="bg-gray-50 p-2 rounded flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FontAwesomeIcon icon={faGripVertical} className="text-gray-400" />
                            <span className="text-sm">
                              {actionIndex + 1}. {action.nom} ({action.dureeEstimee}h)
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => onEditAction(action, event.id)}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded text-xs"
                            >
                              <FontAwesomeIcon icon={faEdit} />
                            </button>
                            <button
                              onClick={() => onDeleteAction(action.id, event.id)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded text-xs"
                            >
                              <FontAwesomeIcon icon={faTrash} />
                            </button>
                          </div>
                        </div>
                      ))}
                      <button
                        onClick={() => onAddAction(event.id)}
                        className="ml-6 text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      >
                        <FontAwesomeIcon icon={faPlus} />
                        Ajouter une action
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {procedure.evenements.length === 0 && (
                <p className="text-gray-500 text-center py-4 text-sm">
                  Aucun événement. Cliquez sur "Ajouter un événement" pour commencer.
                </p>
              )}
            </div>
          </div>

          {/* Durée totale calculée */}
          <div className="bg-blue-50 p-3 rounded-lg">
            <div className="flex items-center gap-2 text-blue-900">
              <FontAwesomeIcon icon={faClock} />
              <span className="font-semibold">
                Durée totale estimée: {procedureService.calculateDureeTotale(procedure)} heures
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Annuler
          </button>
          <button
            onClick={onSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <FontAwesomeIcon icon={faSave} />
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
};

// Composant modal d'édition d'événement
const EventEditModal: React.FC<{
  event: ProcedureEvent;
  setEvent: (e: ProcedureEvent) => void;
  onClose: () => void;
  onSave: () => void;
}> = ({ event, setEvent, onClose, onSave }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[50000]">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold text-gray-900">Événement</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nom de l'événement *
            </label>
            <input
              type="text"
              value={event.nom}
              onChange={(e) => setEvent({ ...event, nom: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={event.description || ''}
              onChange={(e) => setEvent({ ...event, description: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date de début
              </label>
              <MaterialDateTimeField
                value={event.dateDebut}
                onChange={(val) => setEvent({ ...event, dateDebut: new Date(val) })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date de fin
              </label>
              <MaterialDateTimeField
                value={event.dateFin}
                onChange={(val) => setEvent({ ...event, dateFin: new Date(val) })}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Annuler
          </button>
          <button
            onClick={onSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
};

// Composant modal d'édition d'action
const ActionEditModal: React.FC<{
  action: ProcedureAction;
  setAction: (a: ProcedureAction) => void;
  assignableUsers: Utilisateur[];
  onClose: () => void;
  onSave: () => void;
}> = ({ action, setAction, assignableUsers, onClose, onSave }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[50000]">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold text-gray-900">Action</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nom de l'action *
            </label>
            <input
              type="text"
              value={action.nom}
              onChange={(e) => setAction({ ...action, nom: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={action.description || ''}
              onChange={(e) => setAction({ ...action, description: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Durée estimée (heures) *
              </label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={action.dureeEstimee}
                onChange={(e) => setAction({ ...action, dureeEstimee: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type d'action *
              </label>
              <select
                value={action.type}
                onChange={(e) => setAction({ ...action, type: e.target.value as any })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="MANUEL">Manuel</option>
                <option value="AUTOMATIQUE">Automatique</option>
                <option value="VALIDATION">Validation</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Acteur responsable
            </label>
            <select
              value={action.acteurId || ''}
              onChange={(e) => setAction({ ...action, acteurId: e.target.value || undefined })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Aucun (sera assigné lors de l'instance)</option>
              {assignableUsers.map(user => (
                <option key={user.id} value={user.id}>
                  {user.nom} ({user.email}) - {user.role}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Instructions
            </label>
            <textarea
              value={action.instructions || ''}
              onChange={(e) => setAction({ ...action, instructions: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Instructions pour l'exécution de cette action..."
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Annuler
          </button>
          <button
            onClick={onSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
};

export default GestionProcedures;



