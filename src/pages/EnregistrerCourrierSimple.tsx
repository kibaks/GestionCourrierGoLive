import React from 'react';

const EnregistrerCourrierSimple: React.FC = () => {
  return (
    <div className="min-h-screen bg-surface-100">
      <div className="bg-white border-b border-surface-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold">Test Simple</h1>
        </div>
      </div>
      
      <div className="p-8">
        <div className="bg-white rounded-lg p-6 shadow">
          <h2 className="text-lg font-semibold mb-4">Champ Date</h2>
          <input 
            type="date" 
            className="w-full p-2 border rounded"
          />
        </div>
      </div>
    </div>
  );
};

export default EnregistrerCourrierSimple;
