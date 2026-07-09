import { AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

interface InfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string | string[];
  actionText?: string;
  variant?: 'default' | 'warning';
}

export function InfoDialog({
  open,
  onOpenChange,
  title,
  description,
  actionText = 'Aceptar',
  variant = 'default',
}: InfoDialogProps) {
  const isWarning = variant === 'warning';

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className={isWarning ? 'bo-dialog-warning' : undefined}>
        <AlertDialogHeader>
          <AlertDialogTitle className={isWarning ? 'bo-dialog-warning-title flex items-center gap-2.5' : undefined}>
            {isWarning && (
              <span className="bo-dialog-warning-icon">
                <AlertTriangle className="h-5 w-5" />
              </span>
            )}
            {title}
          </AlertDialogTitle>
          {Array.isArray(description) ? (
            <AlertDialogDescription asChild>
              <div className="text-left">
                {isWarning ? (
                  <>
                    <p className="bo-dialog-warning-lead">
                      {description.length === 1
                        ? 'Se detectó un punto a tener en cuenta en esta reserva:'
                        : 'Se detectaron algunos puntos a tener en cuenta en esta reserva:'}
                    </p>
                    <ul className="bo-dialog-warning-list">
                      {description.map((item, index) => (
                        <li key={`${index}-${item}`} className="bo-dialog-warning-item">
                          <span className="bo-dialog-warning-item-icon" aria-hidden="true">
                            <AlertTriangle className="h-4 w-4" />
                          </span>
                          <span className="bo-dialog-warning-item-text">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <ul className="space-y-2">
                    {description.map((item, index) => (
                      <li key={`${index}-${item}`} className="flex items-start gap-2">
                        <span className="mt-[0.35rem] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current" aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </AlertDialogDescription>
          ) : (
            <AlertDialogDescription className="whitespace-pre-line text-left">
              {description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction>{actionText}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
