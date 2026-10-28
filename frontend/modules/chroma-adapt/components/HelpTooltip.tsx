import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '../../../components/ui/dialog';

interface HelpTooltipProps { title: string; content: string; }
/** Detailed help uses a separate button beside its related action. */
const HelpTooltip: React.FC<HelpTooltipProps> = ({ title, content }) => {
  const [open, setOpen] = useState(false);
  return <span className="inline-flex shrink-0" onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}><Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="ghost" size="icon" aria-label={title}
      className="h-11 w-11 shrink-0 rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground sm:h-6 sm:w-6"><HelpCircle size={15} /></Button></DialogTrigger>
    <DialogContent className="w-[calc(100%-2rem)] rounded-xl" onClick={event => event.stopPropagation()}>
      <DialogTitle className="flex items-center gap-2"><HelpCircle className="h-4 w-4 text-primary" />{title}</DialogTitle>
      <DialogDescription className="whitespace-pre-line text-sm leading-relaxed">{content.replaceAll('\\n', '\n')}</DialogDescription>
      <div className="flex justify-end"><Button onClick={event => { event.stopPropagation(); setOpen(false); }}>知道了</Button></div>
    </DialogContent>
  </Dialog></span>;
};
export default HelpTooltip;
