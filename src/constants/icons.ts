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
import ArrowUpDoubleIcon from '@hugeicons/core-free-icons/ArrowUpDoubleIcon';
import Book02Icon from '@hugeicons/core-free-icons/Book02Icon';
import BrainIcon from '@hugeicons/core-free-icons/BrainIcon';
import Calendar03Icon from '@hugeicons/core-free-icons/Calendar03Icon';
import Camera01Icon from '@hugeicons/core-free-icons/Camera01Icon';
import CameraOff01Icon from '@hugeicons/core-free-icons/CameraOff01Icon';
import CameraRotated01Icon from '@hugeicons/core-free-icons/CameraRotated01Icon';
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon';
import CheckIcon from '@hugeicons/core-free-icons/CheckIcon';
import CheckListIcon from '@hugeicons/core-free-icons/CheckListIcon';
import CheckmarkCircle02Icon from '@hugeicons/core-free-icons/CheckmarkCircle02Icon';
import Clock01Icon from '@hugeicons/core-free-icons/Clock01Icon';
import CoinsDollarIcon from '@hugeicons/core-free-icons/CoinsDollarIcon';
import Delete02Icon from '@hugeicons/core-free-icons/Delete02Icon';
import Dumbbell01Icon from '@hugeicons/core-free-icons/Dumbbell01Icon';
import Edit02Icon from '@hugeicons/core-free-icons/Edit02Icon';
import FavouriteIcon from '@hugeicons/core-free-icons/FavouriteIcon';
import Flag02Icon from '@hugeicons/core-free-icons/Flag02Icon';
import FlameIcon from '@hugeicons/core-free-icons/FlameIcon';
import FlashIcon from '@hugeicons/core-free-icons/FlashIcon';
import FlashOffIcon from '@hugeicons/core-free-icons/FlashOffIcon';
import GoalIcon from '@hugeicons/core-free-icons/GoalIcon';
import GoogleIcon from '@hugeicons/core-free-icons/GoogleIcon';
import Home01Icon from '@hugeicons/core-free-icons/Home01Icon';
import HourglassIcon from '@hugeicons/core-free-icons/HourglassIcon';
import Image01Icon from '@hugeicons/core-free-icons/Image01Icon';
import Location01Icon from '@hugeicons/core-free-icons/Location01Icon';
import LocationOffline01Icon from '@hugeicons/core-free-icons/LocationOffline01Icon';
import LockIcon from '@hugeicons/core-free-icons/LockIcon';
import LockKeyholeIcon from '@hugeicons/core-free-icons/LockKeyholeIcon';
import LockKeyholeOpenIcon from '@hugeicons/core-free-icons/LockKeyholeOpenIcon';
import Logout01Icon from '@hugeicons/core-free-icons/Logout01Icon';
import Mail01Icon from '@hugeicons/core-free-icons/Mail01Icon';
import Message01Icon from '@hugeicons/core-free-icons/Message01Icon';
import MinusSignIcon from '@hugeicons/core-free-icons/MinusSignIcon';
import Money03Icon from '@hugeicons/core-free-icons/Money03Icon';
import Moon02Icon from '@hugeicons/core-free-icons/Moon02Icon';
import MoreHorizontalIcon from '@hugeicons/core-free-icons/MoreHorizontalIcon';
import Notification01Icon from '@hugeicons/core-free-icons/Notification01Icon';
import NotificationOff01Icon from '@hugeicons/core-free-icons/NotificationOff01Icon';
import RepeatIcon from '@hugeicons/core-free-icons/RepeatIcon';
import Settings02Icon from '@hugeicons/core-free-icons/Settings02Icon';
import Share03Icon from '@hugeicons/core-free-icons/Share03Icon';
import SparklesIcon from '@hugeicons/core-free-icons/SparklesIcon';
import Sun03Icon from '@hugeicons/core-free-icons/Sun03Icon';
import Target02Icon from '@hugeicons/core-free-icons/Target02Icon';
import Tick02Icon from '@hugeicons/core-free-icons/Tick02Icon';
import Timer02Icon from '@hugeicons/core-free-icons/Timer02Icon';
import TimerOffIcon from '@hugeicons/core-free-icons/TimerOffIcon';
import UndoIcon from '@hugeicons/core-free-icons/UndoIcon';
import UserCircleIcon from '@hugeicons/core-free-icons/UserCircleIcon';
import UserIcon from '@hugeicons/core-free-icons/UserIcon';
import WorkIcon from '@hugeicons/core-free-icons/WorkIcon';

export {
  Add01Icon,
  Alert02Icon,
  AppleIcon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUpDoubleIcon,
  Book02Icon,
  BrainIcon,
  Calendar03Icon,
  Camera01Icon,
  CameraOff01Icon,
  CameraRotated01Icon,
  Cancel01Icon,
  CheckListIcon,
  CheckIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  CoinsDollarIcon,
  Delete02Icon,
  Dumbbell01Icon,
  Edit02Icon,
  FavouriteIcon,
  Flag02Icon,
  FlameIcon,
  FlashIcon,
  FlashOffIcon,
  GoalIcon,
  GoogleIcon,
  Home01Icon,
  HourglassIcon,
  Image01Icon,
  Location01Icon,
  LocationOffline01Icon,
  LockIcon,
  LockKeyholeIcon,
  LockKeyholeOpenIcon,
  Logout01Icon,
  Mail01Icon,
  Message01Icon,
  MinusSignIcon,
  Money03Icon,
  Moon02Icon,
  MoreHorizontalIcon,
  Notification01Icon,
  NotificationOff01Icon,
  RepeatIcon,
  Settings02Icon,
  Share03Icon,
  SparklesIcon,
  Sun03Icon,
  Target02Icon,
  Tick02Icon,
  Timer02Icon,
  TimerOffIcon,
  UndoIcon,
  UserCircleIcon,
  UserIcon,
  WorkIcon,
};

/** Every habit renders the same icon until per-habit icons exist; it matches the tab glyph. */
export const HabitIcon = CheckListIcon;

/** Same for goals (`GoalIcon` is also the goals tab glyph). */
export const GoalListIcon = GoalIcon;
