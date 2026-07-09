import { Clock } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

type InactivityWarningDialogProps = {
  open: boolean;
  secondsLeft: number;
  onStay: () => void;
};

export function InactivityWarningDialog({
  open,
  secondsLeft,
  onStay,
}: InactivityWarningDialogProps) {
  const secondsLabel = secondsLeft === 1 ? 'segundo' : 'segundos';

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Cualquier cierre del diálogo (botón o Escape) cuenta como actividad:
        // el usuario está presente, así que reiniciamos el contador.
        if (!next) onStay();
      }}
    >
      <AlertDialogContent className="bo-dialog-warning">
        <AlertDialogHeader>
          <AlertDialogTitle className="bo-dialog-warning-title flex items-center gap-2.5">
            <span className="bo-dialog-warning-icon">
              <Clock className="h-5 w-5" />
            </span>
            Su sesión está por cerrarse
          </AlertDialogTitle>
          <AlertDialogDescription>
            Por inactividad, su sesión se cerrará en{' '}
            <strong>{secondsLeft}</strong> {secondsLabel}. ¿Desea continuar conectado?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onStay}>Seguir conectado</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
