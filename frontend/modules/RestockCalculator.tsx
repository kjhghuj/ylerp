import React, { useState } from 'react';
import { useStore } from '../StoreContext';
import { RestockHeader } from './restock/components/RestockHeader';
import { ImportSection } from './restock/components/ImportSection';
import { MappingManager } from './restock/components/MappingManager';
import { MappingImportModal } from './restock/components/MappingImportModal';
import { InventoryTable } from './restock/components/InventoryTable';
import { useInventoryImport } from './restock/hooks/useInventoryImport';

export const RestockCalculator: React.FC = () => {
  const { strings, warehouseMappings } = useStore();
  const t = strings.inventory;
  
  const [leadTimeSetting, setLeadTimeSetting] = useState(25);
  const [targetDate, setTargetDate] = useState(() => {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      return d.toISOString().split('T')[0];
  });

  const [showMapping, setShowMapping] = useState(false);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [mappingModalType, setMappingModalType] = useState<'official' | 'third' | 'grouping'>('official');

  // Use the hook for import logic
  const { fileInputRef, handleFileClick, processFile } = useInventoryImport(leadTimeSetting);

  const openMappingModal = (type: 'official' | 'third' | 'grouping') => {
      setMappingModalType(type);
      setShowMappingModal(true);
  };

  return (
    <div className="space-y-6 h-full flex flex-col relative pb-8">
       <RestockHeader 
          leadTime={leadTimeSetting} 
          setLeadTime={setLeadTimeSetting}
          targetDate={targetDate}
          setTargetDate={setTargetDate}
          showMapping={showMapping}
          setShowMapping={setShowMapping}
          t={t}
       />

       <ImportSection 
          handleFileClick={handleFileClick}
          fileInputRef={fileInputRef}
          processFile={(e) => processFile(e, () => { setShowMapping(true); })}
          t={t}
       />

       {showMapping && (
           <MappingManager 
              mappings={warehouseMappings}
              onOpenImportModal={openMappingModal}
              t={t}
           />
       )}
       
       <MappingImportModal 
          isOpen={showMappingModal}
          onClose={() => setShowMappingModal(false)}
          type={mappingModalType}
          t={t}
       />

       <InventoryTable 
          targetDate={targetDate}
          leadTime={leadTimeSetting}
          t={t}
       />
    </div>
  );
};
