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
}

export function InfoDialog({
  open,
  onOpenChange,
  title,
  description,
  actionText = 'Aceptar',
}: InfoDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {Array.isArray(description) ? (
            <AlertDialogDescription asChild>
              <div className="text-left">
                <ul className="space-y-2">
                  {description.map((item, index) => (
                    <li key={`${index}-${item}`} className="flex items-start gap-2">
                      <span className="mt-[0.35rem] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
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
