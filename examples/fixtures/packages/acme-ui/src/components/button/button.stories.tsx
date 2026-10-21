// decoy title string before meta to test scoping in extractTitle
const decoyTitle = 'title: "Decoy/ShouldNotAppear"';

import { Button } from './Button';

const meta = {
  title: 'Primitives/Button',
  component: Button,
  args: { children: 'Click me' },
};

export default meta;

export const Default = {};

export const Secondary = { args: { variant: 'secondary' }, parameters: { layout: 'centered' } };

export const Large = { args: { size: 'lg' } };

export const Disabled = { args: { disabled: true } };
