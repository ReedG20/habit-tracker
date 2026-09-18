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
import CheckmarkCircle02Icon from '@hugeicons/core-free-icons/CheckmarkCircle02Icon';
import Delete02Icon from '@hugeicons/core-free-icons/Delete02Icon';
import Edit02Icon from '@hugeicons/core-free-icons/Edit02Icon';
import FlameIcon from '@hugeicons/core-free-icons/FlameIcon';
import FolderLibraryIcon from '@hugeicons/core-free-icons/FolderLibraryIcon';
import GoalIcon from '@hugeicons/core-free-icons/GoalIcon';
import GoogleIcon from '@hugeicons/core-free-icons/GoogleIcon';
import Image01Icon from '@hugeicons/core-free-icons/Image01Icon';
import Logout01Icon from '@hugeicons/core-free-icons/Logout01Icon';
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
  CheckmarkCircle02Icon,
  Delete02Icon,
  Edit02Icon,
  FlameIcon,
  FolderLibraryIcon,
  GoalIcon,
  GoogleIcon,
  Image01Icon,
  Logout01Icon,
  Notification01Icon,
  Settings02Icon,
  UserCircleIcon,
};

/** Every habit renders the same icon until per-habit icons exist. */
export const HabitIcon = GoalIcon;

/** Same for projects. */
export const ProjectIcon = FolderLibraryIcon;
