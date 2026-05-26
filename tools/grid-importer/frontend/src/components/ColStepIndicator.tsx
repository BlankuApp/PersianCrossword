import { Check } from 'lucide-react';
import type { ColStep } from '../types';

const STEPS: { id: ColStep; label: string }[] = [
  { id: 'select', label: 'انتخاب ناحیه‌ها' },
  { id: 'export', label: 'خروجی' },
];

const ORDER: ColStep[] = ['select', 'export'];

interface Props {
  current: ColStep;
}

export default function ColStepIndicator({ current }: Props) {
  const currentIndex = ORDER.indexOf(current);

  return (
    <nav className="step-indicator" aria-label="مراحل">
      {STEPS.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={step.id} className="step-item">
            <div
              className={
                'step-circle' +
                (done ? ' done' : '') +
                (active ? ' active' : '')
              }
            >
              {done ? <Check size={14} strokeWidth={3} /> : <span>{i + 1}</span>}
            </div>
            <span
              className={
                'step-label' +
                (active ? ' active' : '') +
                (done ? ' done' : '')
              }
            >
              {step.label}
            </span>
            {i < STEPS.length - 1 && (
              <div className={'step-connector' + (done ? ' done' : '')} />
            )}
          </div>
        );
      })}
    </nav>
  );
}
