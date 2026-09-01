import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { Button as ShadButton } from '@/components/ui/button'
import { Input as ShadInput } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge as ShadBadge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import {
  Select as ShadSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export { Checkbox } from '@/components/ui/checkbox'
export { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
export { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
type ButtonSize = 'default' | 'xs' | 'sm' | 'lg' | 'icon'

const VARIANT_MAP: Record<ButtonVariant, 'default' | 'outline' | 'destructive' | 'ghost'> = {
  primary: 'default',
  secondary: 'outline',
  danger: 'destructive',
  ghost: 'ghost'
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function Button({ variant = 'secondary', size = 'default', className, ...rest }: ButtonProps) {
  return <ShadButton variant={VARIANT_MAP[variant]} size={size} className={className} {...rest} />
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <ShadInput className={className} {...rest} />
}

export function Select({
  value,
  defaultValue,
  onChange,
  className,
  disabled,
  children
}: {
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  className?: string
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <ShadSelect value={value} defaultValue={defaultValue} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={cn('w-full', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </ShadSelect>
  )
}

export function SelectOption({
  value,
  children,
  disabled
}: {
  value: string
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <SelectItem value={value} disabled={disabled}>
      {children}
    </SelectItem>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <Label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground/70">{hint}</span>}
    </Label>
  )
}

export function Modal({
  title,
  children,
  onClose,
  wide
}: {
  title: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className={cn('max-h-[85vh] overflow-y-auto', wide ? 'sm:max-w-[680px]' : 'sm:max-w-[440px]')}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = true,
  onConfirm,
  onClose
}: {
  title: string
  description?: string
  confirmLabel: string
  cancelLabel: string
  destructive?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            className={cn(destructive && 'bg-destructive text-white hover:bg-destructive/90')}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

type BadgeTone = 'green' | 'red' | 'amber' | 'slate' | 'indigo'

const BADGE_TONES: Record<BadgeTone, string> = {
  green: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-transparent',
  red: 'bg-destructive/15 text-destructive border-transparent',
  amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-transparent',
  slate: 'bg-muted text-muted-foreground border-transparent',
  indigo: 'bg-primary/10 text-primary border-transparent'
}

export function Badge({ tone = 'slate', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <ShadBadge className={BADGE_TONES[tone]}>{children}</ShadBadge>
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <p className="font-medium text-foreground/70">{title}</p>
      {hint && <p className="text-sm mt-1">{hint}</p>}
    </div>
  )
}
