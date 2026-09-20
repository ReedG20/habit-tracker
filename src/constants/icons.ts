/**
 * Every HugeIcons icon used in the app is imported here, one deep import per icon.
 * Importing from the `@hugeicons/core-free-icons` barrel would pull all 6,000 icons
 * into the bundle, since Metro does not tree-shake by default.
 */

/* eslint-disable import/no-unresolved -- the ESLint resolver does not read the package's subpath exports map; Metro and TypeScript both resolve these */

import Add01Icon from '@hugeicons/core-free-icons/Add01Icon';
import Alert02Icon from '@hugeicons/core-free-icons/Alert02Icon';
import AppleIcon from '@hugeicons/core-free-icons/AppleIcon';
import ArrowLeft01Icon from '@hugeicons/core-free-icons/ArrowLeft01Icon';
import ArrowRight01Icon from '@hugeicons/core-free-icons/ArrowRight01Icon';
import Camera01Icon from '@hugeicons/core-free-icons/Camera01Icon';
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon';
import CheckListIcon from '@hugeicons/core-free-icons/CheckListIcon';
import CheckmarkCircle02Icon from '@hugeicons/core-free-icons/CheckmarkCircle02Icon';
import CoinsDollarIcon from '@hugeicons/core-free-icons/CoinsDollarIcon';
import Delete02Icon from '@hugeicons/core-free-icons/Delete02Icon';
import Edit02Icon from '@hugeicons/core-free-icons/Edit02Icon';
import FlameIcon from '@hugeicons/core-free-icons/FlameIcon';
import GoalIcon from '@hugeicons/core-free-icons/GoalIcon';
import GoogleIcon from '@hugeicons/core-free-icons/GoogleIcon';
import Image01Icon from '@hugeicons/core-free-icons/Image01Icon';
import Logout01Icon from '@hugeicons/core-free-icons/Logout01Icon';
import MinusSignIcon from '@hugeicons/core-free-icons/MinusSignIcon';
import Notification01Icon from '@hugeicons/core-free-icons/Notification01Icon';
import Settings02Icon from '@hugeicons/core-free-icons/Settings02Icon';
import UserCircleIcon from '@hugeicons/core-free-icons/UserCircleIcon';

export {
  Add01Icon,
  Alert02Icon,
  AppleIcon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Camera01Icon,
  Cancel01Icon,
  CheckListIcon,
  CheckmarkCircle02Icon,
  CoinsDollarIcon,
  Delete02Icon,
  Edit02Icon,
  FlameIcon,
  GoalIcon,
  GoogleIcon,
  Image01Icon,
  Logout01Icon,
  MinusSignIcon,
  Notification01Icon,
  Settings02Icon,
  UserCircleIcon,
};

/** Every habit renders the same icon until per-habit icons exist; it matches the tab glyph. */
export const HabitIcon = CheckListIcon;

/** Same for goals (`GoalIcon` is also the goals tab glyph). */
export const GoalListIcon = GoalIcon;
