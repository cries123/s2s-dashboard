import React, { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch, setDoc, deleteDoc, deleteField, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../firebase';
import { useAuth } from '../../../hooks/useAuth';
import { useCustomers } from '../../../hooks/useCustomers';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { Customer, DealershipSettings, DepartmentColumnId, DispatchRepairOrder } from '../../../types';
import { cn } from '../../../lib/utils';
import {
  mergeLaneCapacity,
  DispatchProductionLane,
  DISPATCH_STATUS_COLORS,
  DISPATCH_INTAKE_FLAG_STYLES,
  DISPATCH_PRODUCTION_LANES,
  dispatchLaneLabel,
} from '../../../lib/dispatchConfig';
import { findCustomersByLastName, enrichDispatchFromCustomer, displayCustomerLastName } from '../../../lib/dispatchCustomerMatch';
import {
  countActiveRosByTech,
  dispatchTechRosterFromSettings,
  formatTechLabelWithCount,
  isCrossDealershipDispatchRoster,
  resolveTechDisplayName,
} from '../../../lib/dispatchTechRoster';
import { dispatchTechRosterForDealership } from '../../../constants/dispatchTechDefaults';
import { sortDispatchOrdersByRoNumber } from '../../../lib/dispatchRoSort';
import { DispatchTechSelector } from './DispatchTechSelector';
import { isPreviewMode } from '../../../lib/previewMode';
import {
  buildPreviewDispatchOrders,
  PREVIEW_DEALERSHIP_SETTINGS,
} from '../../../lib/previewFixtures';
import { DispatchMetricsBar } from './DispatchMetricsBar';
import { DispatchMobileBoard, type MobileDispatchTab } from './DispatchMobileBoard';
import { DispatchIntakeForm, DispatchIntakePanel } from './DispatchIntakeForm';
import { DispatchRoSearch } from './DispatchRoSearch';
import {
  appointmentTrackerDoc,
  legacyAppointmentTrackerDoc,
  resolveAppointmentCount,
} from '../../../lib/appointmentTracker';
import {
  buildDispatchMoveUpdate,
  buildOvernightDownInShopPatch,
  isOvernightRo,
  normalizeDispatchOrder,
  shouldSweepOvernightCarryover,
  type DispatchMoveTarget,
} from '../../../lib/dispatchTransitions';
import type { DispatchStatus } from '../../../types';
import {
  filterDispatchOrdersForDealership,
  isDispatchOrderForDealership,
} from '../../../lib/dispatchDealershipScope';
import { getDispatchDatePst, isDispatchOvernightSweepWindow } from '../../../lib/dispatchPst';
import {
  combinePromiseDateAndTime,
  getPromiseTimeState,
  isPromiseTimeWithinBusinessHours,
  PROMISE_BUSINESS_HOURS_LABEL,
  validatePromiseDateAndTime,
} from '../../../lib/dispatchPromiseTime';
import { DispatchPromiseCountdown } from './DispatchPromiseCountdown';
import { CardPromiseTimeEditor } from './CardPromiseTimeEditor';
import { 
  Users, CheckCircle2, ClipboardList, AlertTriangle, HelpCircle, 
  Plus, Calendar, Sparkles, RefreshCw, Layers, CheckSquare, Trash2,
  Check, Wrench, Monitor, X, Inbox, MapPin, Moon
} from 'lucide-react';

function playQueueAlert() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.06;
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    setTimeout(() => ctx.close(), 300);
  } catch {
    // Audio not available in this browser context
  }
}

const LANE_ICONS: Record<DispatchProductionLane, typeof Layers> = {
  lube: Layers,
  quick_service: Sparkles,
  ac_electrical: AlertTriangle,
  drivability: Wrench,
  heavyline: Users,
  diesel: ClipboardList,
  trans: RefreshCw,
  down_in_shop: Moon,
};

const DEPARTMENTS = DISPATCH_PRODUCTION_LANES.map((lane) => ({
  id: lane.id,
  label: lane.label,
  shortLabel: lane.shortLabel,
  icon: LANE_ICONS[lane.id],
}));

function renderIntakeFlagBadge(ro: DispatchRepairOrder, compact = false) {
  if (ro.isWaiting) {
    const style = DISPATCH_INTAKE_FLAG_STYLES.waiting;
    return (
      <span
        className={cn(
          'font-black uppercase rounded shrink-0',
          compact ? 'text-[8px] px-1 py-0.5' : 'text-[9px] px-1.5 py-0.5'
        )}
        style={{ backgroundColor: style.bg, color: style.text }}
      >
        {style.label}
      </span>
    );
  }
  if (ro.isPdl) {
    const style = DISPATCH_INTAKE_FLAG_STYLES.pdl;
    return (
      <span
        className={cn(
          'font-black uppercase rounded shrink-0',
          compact ? 'text-[8px] px-1 py-0.5' : 'text-[9px] px-1.5 py-0.5'
        )}
        style={{ backgroundColor: style.bg, color: style.text }}
      >
        {style.label}
      </span>
    );
  }
  return null;
}

export function DispatchBoard({ 
  currentDealershipId,
  customers: customersProp = [],
  showNotification
}: { 
  key?: string;
  currentDealershipId: string;
  customers?: Customer[];
  showNotification?: (msg: string, isError?: boolean) => void;
}) {
  const { user } = useAuth();
  const { customers: liveCustomers } = useCustomers(
    currentDealershipId || undefined,
    user?.role === 'admin'
  );
  const customers = liveCustomers.length > 0 ? liveCustomers : customersProp;
  
  // States of Active RO list
  const [orders, setOrders] = useState<DispatchRepairOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  const [moveMenuRoId, setMoveMenuRoId] = useState<string | null>(null);
  const moveMenuAnchorRef = useRef<HTMLElement | null>(null);
  const moveMenuPortalRef = useRef<HTMLDivElement | null>(null);
  const [moveMenuLayout, setMoveMenuLayout] = useState<{
    top: number;
    left: number;
    width: number;
    placement: 'above' | 'below';
  } | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [mobileLaneTab, setMobileLaneTab] = useState<MobileDispatchTab>('intake');
  const [draggingRoId, setDraggingRoId] = useState<string | null>(null);
  const [dragOverLane, setDragOverLane] = useState<DispatchMoveTarget | null>(null);
  const [displayCycleIndex, setDisplayCycleIndex] = useState(0);
  const [showTvExit, setShowTvExit] = useState(true);
  const [queuePulse, setQueuePulse] = useState(false);
  const prevQueueCountRef = useRef(0);
  const tvExitTimerRef = useRef<number | null>(null);

  const isDesktop = useMediaQuery('(min-width: 768px)');

  // Completed items view states
  const [showCompleted, setShowCompleted] = useState<boolean>(false);
  const [isDisplayMode, setIsDisplayMode] = useState<boolean>(false);
  const [lookupRoId, setLookupRoId] = useState<string | null>(null);

  // Form states
  const [roNumber, setRoNumber] = useState('');
  const [techNumber, setTechNumber] = useState('');
  const [customerFirstName, setCustomerFirstName] = useState('');
  const [customerLastName, setCustomerLastName] = useState('');
  const [vinLastEight, setVinLastEight] = useState('');
  const [tagNumber, setTagNumber] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [scopedDealershipSettings, setScopedDealershipSettings] = useState<{
    dealershipId: string;
    settings: Partial<DealershipSettings> | null;
  } | null>(null);
  const dealershipSettings =
    scopedDealershipSettings?.dealershipId === currentDealershipId
      ? scopedDealershipSettings.settings
      : null;
  const [todayApptCount, setTodayApptCount] = useState(0);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [initialStatus, setInitialStatus] = useState<DispatchStatus>('WIP');
  const [isWaiting, setIsWaiting] = useState(false);
  const [isPdl, setIsPdl] = useState(false);
  const [promiseDate, setPromiseDate] = useState('');
  const [promiseTime, setPromiseTime] = useState('');
  const [promiseTimeError, setPromiseTimeError] = useState<string | null>(null);
  const [promiseNowMs, setPromiseNowMs] = useState(() => Date.now());

  const businessDatePst = getDispatchDatePst();
  const carryoverSweepInFlightRef = useRef(false);
  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  const openDisplayMode = async () => {
    setShowCompleted(false);
    setIsDisplayMode(true);
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen is optional; fixed overlay still works in-window.
    }
  };

  const closeDisplayMode = () => {
    setIsDisplayMode(false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    }
  };


  const laneCapacity = useMemo(
    () => mergeLaneCapacity(dealershipSettings?.dispatchLaneCapacity),
    [dealershipSettings?.dispatchLaneCapacity]
  );
  const showTodayLoad = dealershipSettings?.dispatchShowTodayLoad !== false;
  const blockWhenFull = !!dealershipSettings?.dispatchBlockWhenFull;
  const apptGoal = dealershipSettings?.appointmentTarget ?? 20;
  const visibleDepartments = useMemo(
    () => DEPARTMENTS.filter((d) => !(dealershipSettings?.hiddenDispatchLanes ?? []).includes(d.id)),
    [dealershipSettings?.hiddenDispatchLanes]
  );
  const productionDisplayColumns = visibleDepartments;

  const dispatchTechRoster = useMemo(
    () => dispatchTechRosterFromSettings(dealershipSettings, currentDealershipId),
    [dealershipSettings, currentDealershipId]
  );

  const techRoCounts = useMemo(() => countActiveRosByTech(orders), [orders]);

  useEffect(() => {
    if (!isDisplayMode) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setShowTvExit(true);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDisplayMode(false);
      }
    };
    const onMouseMove = () => {
      setShowTvExit(true);
      if (tvExitTimerRef.current) window.clearTimeout(tvExitTimerRef.current);
      tvExitTimerRef.current = window.setTimeout(() => setShowTvExit(false), 4000);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousemove', onMouseMove);
    onMouseMove();

    const cycleTimer = window.setInterval(() => {
      setDisplayCycleIndex((prev) => (prev + 1) % Math.max(productionDisplayColumns.length, 1));
    }, 12_000);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousemove', onMouseMove);
      if (tvExitTimerRef.current) window.clearTimeout(tvExitTimerRef.current);
      window.clearInterval(cycleTimer);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => undefined);
      }
    };
  }, [isDisplayMode, productionDisplayColumns.length]);


  const matchCandidates = useMemo(
    () => findCustomersByLastName(customers, customerLastName),
    [customers, customerLastName]
  );

  useEffect(() => {
    const hasActivePromise = orders.some((order) => !order.isCompleted && order.promiseTimeAt);
    if (!hasActivePromise) return;

    const tick = () => setPromiseNowMs(Date.now());
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, [orders]);

  useEffect(() => {
    if (isPreviewMode && currentDealershipId) {
      setScopedDealershipSettings({
        dealershipId: currentDealershipId,
        settings: {
          ...PREVIEW_DEALERSHIP_SETTINGS,
          id: currentDealershipId,
        } as DealershipSettings,
      });
      setTodayApptCount(18);
      return;
    }

    if (!currentDealershipId) {
      setScopedDealershipSettings(null);
      return;
    }

    setScopedDealershipSettings(null);
    const settingsRef = doc(
      db,
      'artifacts',
      'hyundai-sales-to-service',
      'public',
      'data',
      'dealershipSettings',
      currentDealershipId
    );
    return onSnapshot(settingsRef, (snap) => {
      const settings = snap.exists() ? (snap.data() as DealershipSettings) : null;
      const savedRoster = settings?.dispatchTechRoster;

      if (
        settings &&
        savedRoster?.length &&
        (currentDealershipId === 'ford' || currentDealershipId === 'hyundai') &&
        isCrossDealershipDispatchRoster(savedRoster, currentDealershipId)
      ) {
        void updateDoc(settingsRef, {
          dispatchTechRoster: dispatchTechRosterForDealership(currentDealershipId),
          updatedAt: serverTimestamp(),
        });
      }

      setScopedDealershipSettings({
        dealershipId: currentDealershipId,
        settings,
      });
    });
  }, [currentDealershipId]);

  useEffect(() => {
    if (isPreviewMode || !currentDealershipId) return;

    let tenantData: { count?: number; dealershipId?: string } | null = null;
    let legacyData: { count?: number; dealershipId?: string } | null = null;

    const syncCount = () => {
      setTodayApptCount(
        resolveAppointmentCount(
          currentDealershipId,
          tenantData ?? undefined,
          legacyData ?? undefined
        )
      );
    };

    const unsubTenant = onSnapshot(
      appointmentTrackerDoc(db, currentDealershipId, businessDatePst),
      (snap) => {
        tenantData = snap.exists() ? (snap.data() as { count?: number; dealershipId?: string }) : null;
        syncCount();
      }
    );

    const unsubLegacy =
      currentDealershipId === 'hyundai'
        ? onSnapshot(legacyAppointmentTrackerDoc(db, businessDatePst), (snap) => {
            legacyData = snap.exists() ? (snap.data() as { count?: number; dealershipId?: string }) : null;
            syncCount();
          })
        : () => {};

    return () => {
      unsubTenant();
      unsubLegacy();
    };
  }, [currentDealershipId, businessDatePst]);

  const markOvernightSweepComplete = useCallback(
    async (sweepDatePst: string) => {
      if (!currentDealershipId) return;
      const settingsRef = doc(
        db,
        'artifacts',
        'hyundai-sales-to-service',
        'public',
        'data',
        'dealershipSettings',
        currentDealershipId
      );
      await updateDoc(settingsRef, {
        lastDispatchOvernightSweepDate: sweepDatePst,
        updatedAt: serverTimestamp(),
      });
    },
    [currentDealershipId]
  );

  const runMidnightSweepIfDue = useCallback(async () => {
    if (isPreviewMode) return;
    if (!currentDealershipId || carryoverSweepInFlightRef.current) return;
    if (!isDispatchOvernightSweepWindow()) return;

    const sweepDatePst = getDispatchDatePst();
    if (dealershipSettings?.lastDispatchOvernightSweepDate === sweepDatePst) return;

    const scopedOrders = filterDispatchOrdersForDealership(
      ordersRef.current,
      currentDealershipId
    );
    const carryoversToReset = scopedOrders.filter(shouldSweepOvernightCarryover);

    carryoverSweepInFlightRef.current = true;
    const path = 'artifacts/hyundai-sales-to-service/public/data/dispatchOrders';

    try {
      if (carryoversToReset.length > 0) {
        const batch = writeBatch(db);
        carryoversToReset.forEach((ro) => {
          batch.update(doc(db, path, ro.id), buildOvernightDownInShopPatch());
        });
        await batch.commit();
        showNotification?.(
          `End of day: moved ${carryoversToReset.length} ticket(s) from lanes to Down in Shop.`
        );
      }
      await markOvernightSweepComplete(sweepDatePst);
    } catch (err) {
      console.error('[Dispatch] Midnight lane sweep failed:', err);
    } finally {
      carryoverSweepInFlightRef.current = false;
    }
  }, [
    currentDealershipId,
    dealershipSettings?.lastDispatchOvernightSweepDate,
    markOvernightSweepComplete,
    showNotification,
  ]);

  useEffect(() => {
    if (!currentDealershipId) return;
    void runMidnightSweepIfDue();
    const id = window.setInterval(() => void runMidnightSweepIfDue(), 15_000);
    return () => window.clearInterval(id);
  }, [currentDealershipId, runMidnightSweepIfDue]);

  useEffect(() => {
    if (!isPreviewMode || !currentDealershipId) return;
    setOrders(
      sortDispatchOrdersByRoNumber(
        buildPreviewDispatchOrders(currentDealershipId, businessDatePst)
      )
    );
    setLoading(false);
  }, [currentDealershipId, businessDatePst]);

  // Sync / Stream Board State from Firestore
  useEffect(() => {
    if (isPreviewMode || !currentDealershipId) return;

    setLoading(true);
    const path = 'artifacts/hyundai-sales-to-service/public/data/dispatchOrders';
    const q = query(
      collection(db, path),
      where('dealershipId', '==', currentDealershipId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedOrders: DispatchRepairOrder[] = [];
      snapshot.forEach((docSnap) => {
        fetchedOrders.push(
          normalizeDispatchOrder(docSnap.data() as Omit<DispatchRepairOrder, 'id'>, docSnap.id)
        );
      });

      const scopedOrders = filterDispatchOrdersForDealership(fetchedOrders, currentDealershipId);
      setOrders(scopedOrders);
      setLoading(false);
    }, (error) => {
      console.error('[Dispatch] Error streaming dispatch orders:', error);
      setLoading(false);
      if (showNotification) {
        showNotification('Error loading Dispatch Board data from server.', true);
      }
    });

    return () => unsubscribe();
  }, [currentDealershipId]);

  const assertDispatchScope = useCallback(
    (ro: DispatchRepairOrder): boolean => {
      if (!currentDealershipId || isDispatchOrderForDealership(ro, currentDealershipId)) {
        return true;
      }
      showNotification?.('This ticket belongs to another dealership.', true);
      return false;
    },
    [currentDealershipId, showNotification]
  );

  const countInLane = (lane: DepartmentColumnId, excludeId?: string) =>
    (orders.filter((o) => !o.isCompleted && o.department === lane && o.id !== excludeId)).length;

  const isLaneAtCapacity = (lane: DepartmentColumnId, excludeId?: string) => {
    if (lane === 'unassigned') return false;
    const cap = laneCapacity[lane as DispatchProductionLane];
    if (!cap || cap <= 0) return false;
    return countInLane(lane, excludeId) >= cap;
  };

  const handleMoveRo = async (ro: DispatchRepairOrder, target: DispatchMoveTarget) => {
    if (!assertDispatchScope(ro)) return;

    const laneTarget = target === 'overnight' ? 'down_in_shop' : target;
    const overnightVehicle = isOvernightRo(ro, businessDatePst);
    if (
      laneTarget !== 'unassigned' &&
      blockWhenFull &&
      isLaneAtCapacity(laneTarget, ro.id) &&
      !overnightVehicle
    ) {
      showNotification?.(
        `${DEPARTMENTS.find((d) => d.id === laneTarget)?.label || 'Lane'} is at capacity.`,
        true
      );
      return;
    }

    if (isPreviewMode) {
      const patch = buildDispatchMoveUpdate(ro, target, businessDatePst);
      setOrders((prev) =>
        sortDispatchOrdersByRoNumber(
          prev.map((order) =>
            order.id === ro.id ? normalizeDispatchOrder({ ...order, ...patch }, order.id) : order
          )
        )
      );
      setMoveMenuRoId(null);
      showNotification?.(`RO #${ro.roNumber} moved.`);
      return;
    }

    try {
      const roRef = doc(db, 'artifacts/hyundai-sales-to-service/public/data/dispatchOrders', ro.id);
      await updateDoc(roRef, buildDispatchMoveUpdate(ro, target, businessDatePst));
      setMoveMenuRoId(null);
      if (showNotification) {
        const label =
          target === 'overnight'
            ? 'Down in Shop'
            : target === 'unassigned'
              ? 'Waiting Queue'
              : dispatchLaneLabel(target);
        showNotification(`RO #${ro.roNumber} moved to ${label}.`);
      }
    } catch (err: unknown) {
      console.error('[Dispatch] Move mutation error:', err);
      showNotification?.('Failed to move dispatch card.', true);
    }
  };

  const handleDragStart = (e: React.DragEvent, roId: string) => {
    if (!isDesktop) return;
    e.dataTransfer.setData('text/ro-id', roId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingRoId(roId);
  };

  const handleDragEnd = () => {
    setDraggingRoId(null);
    setDragOverLane(null);
  };

  const handleLaneDragOver = (e: React.DragEvent, lane: DispatchMoveTarget) => {
    if (!isDesktop || !draggingRoId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverLane(lane);
  };

  const handleLaneDrop = (e: React.DragEvent, target: DispatchMoveTarget) => {
    if (!isDesktop) return;
    e.preventDefault();
    setDragOverLane(null);
    const roId = e.dataTransfer.getData('text/ro-id');
    if (!roId) return;
    const ro = orders.find((o) => o.id === roId);
    if (ro) handleMoveRo(ro, target);
    setDraggingRoId(null);
  };

  const laneDropProps = (target: DispatchMoveTarget) =>
    isDesktop
      ? {
          onDragOver: (e: React.DragEvent) => handleLaneDragOver(e, target),
          onDragLeave: () => setDragOverLane((prev) => (prev === target ? null : prev)),
          onDrop: (e: React.DragEvent) => handleLaneDrop(e, target),
        }
      : {};

  const updateMoveMenuLayout = useCallback(() => {
    const anchor = moveMenuAnchorRef.current;
    if (!anchor || !moveMenuRoId) return;
    const rect = anchor.getBoundingClientRect();
    const menuHeightEstimate = 240;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placement =
      spaceBelow < menuHeightEstimate && rect.top > menuHeightEstimate ? 'above' : 'below';
    setMoveMenuLayout({
      left: rect.left,
      width: Math.max(rect.width, 240),
      top: placement === 'below' ? rect.bottom + 4 : rect.top - 4,
      placement,
    });
  }, [moveMenuRoId]);

  useLayoutEffect(() => {
    if (!moveMenuRoId) {
      setMoveMenuLayout(null);
      moveMenuAnchorRef.current = null;
      return;
    }
    updateMoveMenuLayout();
    const onScrollOrResize = () => updateMoveMenuLayout();
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [moveMenuRoId, updateMoveMenuLayout]);

  useEffect(() => {
    if (!moveMenuRoId) return;
    let detach: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      const onPointerDown = (event: PointerEvent) => {
        const target = event.target as Node;
        if (moveMenuPortalRef.current?.contains(target)) return;
        if (moveMenuAnchorRef.current?.contains(target)) return;
        setMoveMenuRoId(null);
      };
      document.addEventListener('pointerdown', onPointerDown);
      detach = () => document.removeEventListener('pointerdown', onPointerDown);
    }, 0);
    return () => {
      clearTimeout(timer);
      detach?.();
    };
  }, [moveMenuRoId]);

  const toggleMoveMenu = (roId: string, anchor: HTMLElement, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (moveMenuRoId === roId) {
      setMoveMenuRoId(null);
      return;
    }
    moveMenuAnchorRef.current = anchor;
    setMoveMenuRoId(roId);
  };

  // Rule A Form submission: Default to 'unassigned' department
  const handleSubmitIntake = async (e: React.FormEvent) => {
    e.preventDefault();
    const ro = roNumber.trim();
    const tech = techNumber.trim();
    const ln = customerLastName.trim();
    const tag = tagNumber.trim();

    if (!ro || !tech || !ln || !tag) {
      showNotification?.('RO number, last name, tech number, and tag number are required.', true);
      return;
    }

    setSubmitting(true);
    try {
      const newRoId = doc(collection(db, 'artifacts/hyundai-sales-to-service/public/data/dispatchOrders')).id;
      const docRef = doc(db, 'artifacts/hyundai-sales-to-service/public/data/dispatchOrders', newRoId);

      let crmMatch = selectedCustomer;
      if (!crmMatch && matchCandidates.length === 1) {
        crmMatch = matchCandidates[0];
      }
      if (!crmMatch && matchCandidates.length > 1) {
        showNotification?.('Multiple CRM matches — select a customer below before queueing.', true);
        setSubmitting(false);
        return;
      }

      const fn = customerFirstName.trim();
      const vin = vinLastEight.trim().toUpperCase();
      const displayName = [fn, ln].filter(Boolean).join(' ');

      const payload: DispatchRepairOrder = {
        id: newRoId,
        roNumber: ro,
        techNumber: tech,
        tagNumber: tag,
        customerLastName: ln,
        customerName: displayName,
        department: 'unassigned',
        currentLaneId: 'unassigned',
        lifecycleStatus: 'active',
        status: initialStatus,
        isCompleted: false,
        isWaiting,
        isPdl,
        dateCreated: businessDatePst,
        lastUpdated: new Date().toISOString(),
        dealershipId: currentDealershipId,
        ...(crmMatch ? enrichDispatchFromCustomer(crmMatch) : {}),
      };

      payload.roNumber = ro;
      payload.techNumber = tech;
      payload.tagNumber = tag;
      payload.customerLastName = ln;
      payload.customerName = fn
        ? `${fn} ${ln}`.trim()
        : (payload.customerName || ln);
      if (vin) {
        payload.vinLastEight = vin;
      }
      const phone = phoneNumber.trim();
      if (phone) {
        payload.phoneNumber = phone;
      }
      const promiseValidation = validatePromiseDateAndTime(promiseDate, promiseTime);
      if (!promiseValidation.valid) {
        setPromiseTimeError(promiseValidation.error ?? 'Invalid promise time.');
        showNotification?.(promiseValidation.error ?? 'Invalid promise time.', true);
        setSubmitting(false);
        return;
      }
      setPromiseTimeError(null);

      const promiseIso = combinePromiseDateAndTime(promiseDate, promiseTime);
      if (promiseIso) {
        payload.promiseTimeAt = promiseIso;
      }

      if (isPreviewMode) {
        setOrders((prev) =>
          sortDispatchOrdersByRoNumber([
            ...prev,
            normalizeDispatchOrder(payload, payload.id),
          ])
        );
      } else {
        await setDoc(docRef, payload);
      }

      // Reset form states
      setRoNumber('');
      setTechNumber('');
      setCustomerFirstName('');
      setCustomerLastName('');
      setPhoneNumber('');
      setVinLastEight('');
      setTagNumber('');
      setSelectedCustomer(null);
      setInitialStatus('WIP');
      setIsWaiting(false);
      setIsPdl(false);
      setPromiseDate('');
      setPromiseTime('');
      setPromiseTimeError(null);

      if (showNotification) {
        showNotification(`Ticket RO #${payload.roNumber} successfully queued.`);
      }
    } catch (err: any) {
      console.error('[Dispatch] Intake submission error:', err);
      if (showNotification) showNotification('Failed to create new Dispatch card.', true);
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle card completion (Rule B triggers immediate removal from active arrays)
  const handleToggleComplete = async (ro: DispatchRepairOrder, completed: boolean) => {
    if (!assertDispatchScope(ro)) return;

    if (isPreviewMode) {
      setOrders((prev) =>
        prev.map((order) =>
          order.id === ro.id
            ? { ...order, isCompleted: completed, lastUpdated: new Date().toISOString() }
            : order
        )
      );
      showNotification?.(
        completed ? `RO #${ro.roNumber} marked as completed.` : `RO #${ro.roNumber} restored.`
      );
      return;
    }

    try {
      const docRef = doc(db, 'artifacts/hyundai-sales-to-service/public/data/dispatchOrders', ro.id);
      await updateDoc(docRef, {
        isCompleted: completed,
        lastUpdated: new Date().toISOString()
      });
      if (showNotification) {
        showNotification(completed ? `RO #${ro.roNumber} marked as completed.` : `RO #${ro.roNumber} restored back to active board.`);
      }
    } catch (err: any) {
      console.error('[Dispatch] Mutating completion error:', err);
      if (showNotification) showNotification('Failed to update ticket status.', true);
    }
  };

  // Quick Action: Toggling Status directly from the card
  const handleUpdatePromiseTime = async (roId: string, promiseTimeAt: string | null) => {
    const ro = orders.find((order) => order.id === roId);
    if (ro && !assertDispatchScope(ro)) return;

    if (promiseTimeAt && !isPromiseTimeWithinBusinessHours(promiseTimeAt)) {
      showNotification?.(`Promise time must be between ${PROMISE_BUSINESS_HOURS_LABEL}.`, true);
      return;
    }

    const patch = {
      promiseTimeAt: promiseTimeAt ?? undefined,
      lastUpdated: new Date().toISOString(),
    };

    if (isPreviewMode) {
      setOrders((prev) =>
        prev.map((order) =>
          order.id === roId
            ? {
                ...order,
                promiseTimeAt: promiseTimeAt ?? undefined,
                lastUpdated: patch.lastUpdated,
              }
            : order
        )
      );
      return;
    }

    try {
      const docRef = doc(db, 'artifacts/hyundai-sales-to-service/public/data/dispatchOrders', roId);
      await updateDoc(docRef, {
        promiseTimeAt: promiseTimeAt ?? deleteField(),
        lastUpdated: patch.lastUpdated,
      });
    } catch (err: unknown) {
      console.error('[Dispatch] Promise time update error:', err);
      showNotification?.('Failed to update promise time.', true);
    }
  };

  const handleUpdateTech = async (ro: DispatchRepairOrder, newTechNumber: string) => {
    if (!assertDispatchScope(ro)) return;
    const trimmed = newTechNumber.trim();
    if (!trimmed || trimmed === ro.techNumber) return;

    if (isPreviewMode) {
      setOrders((prev) =>
        prev.map((order) =>
          order.id === ro.id
            ? { ...order, techNumber: trimmed, lastUpdated: new Date().toISOString() }
            : order
        )
      );
      showNotification?.(
        `RO #${ro.roNumber} → ${resolveTechDisplayName(trimmed, dispatchTechRoster)}.`
      );
      return;
    }

    try {
      const docRef = doc(db, 'artifacts/hyundai-sales-to-service/public/data/dispatchOrders', ro.id);
      await updateDoc(docRef, {
        techNumber: trimmed,
        lastUpdated: new Date().toISOString(),
      });
      showNotification?.(
        `RO #${ro.roNumber} → ${resolveTechDisplayName(trimmed, dispatchTechRoster)}.`
      );
    } catch (err: unknown) {
      console.error('[Dispatch] Tech reassignment error:', err);
      showNotification?.('Failed to update technician.', true);
    }
  };

  const handleUpdateStatus = async (roId: string, newStatus: DispatchStatus) => {
    const ro = orders.find((order) => order.id === roId);
    if (ro && !assertDispatchScope(ro)) return;

    if (isPreviewMode) {
      setOrders((prev) =>
        prev.map((order) =>
          order.id === roId
            ? { ...order, status: newStatus, lastUpdated: new Date().toISOString() }
            : order
        )
      );
      return;
    }

    try {
      const docRef = doc(db, 'artifacts/hyundai-sales-to-service/public/data/dispatchOrders', roId);
      await updateDoc(docRef, {
        status: newStatus,
        lastUpdated: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('[Dispatch] Status update error:', err);
    }
  };

  // Remove card entirely
  const handleDeleteCard = async (ro: DispatchRepairOrder) => {
    if (!assertDispatchScope(ro)) return;

    if (isPreviewMode) {
      setOrders((prev) => prev.filter((order) => order.id !== ro.id));
      showNotification?.(`RO #${ro.roNumber} removed.`);
      return;
    }

    try {
      const docRef = doc(db, 'artifacts/hyundai-sales-to-service/public/data/dispatchOrders', ro.id);
      await deleteDoc(docRef);
      if (showNotification) showNotification(`RO #${ro.roNumber} removed.`);
    } catch (err: any) {
      console.error('[Dispatch] Delete error:', err);
    }
  };

  // Split Active and Completed tickets
  const activeTickets = useMemo(() => {
    return orders.filter(o => !o.isCompleted);
  }, [orders]);

  const completedTickets = useMemo(() => {
    return sortDispatchOrdersByRoNumber(orders.filter((o) => o.isCompleted));
  }, [orders]);

  const lookupRo = useMemo(
    () => orders.find((order) => order.id === lookupRoId) || null,
    [lookupRoId, orders]
  );

  useEffect(() => {
    if (!lookupRoId || showCompleted) return;
    const el = document.querySelector(`[data-dispatch-ro-id="${lookupRoId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [lookupRoId, showCompleted]);

  // Group active tickets by Department column to build layout fast
  const ticketsByColumn = useMemo(() => {
    const acc: Record<DepartmentColumnId, DispatchRepairOrder[]> = {
      lube: [],
      quick_service: [],
      ac_electrical: [],
      drivability: [],
      heavyline: [],
      diesel: [],
      trans: [],
      down_in_shop: [],
      unassigned: [],
    };
    
    activeTickets.forEach((t) => {
      if (acc[t.department]) {
        acc[t.department].push(t);
      } else {
        acc.unassigned.push(t);
      }
    });

    (Object.keys(acc) as DepartmentColumnId[]).forEach((key) => {
      acc[key] = sortDispatchOrdersByRoNumber(acc[key]);
    });

    return acc;
  }, [activeTickets]);

  useEffect(() => {
    const queueCount = ticketsByColumn.unassigned.length;
    if (queueCount > prevQueueCountRef.current && prevQueueCountRef.current > 0) {
      setQueuePulse(true);
      if (isDisplayMode) playQueueAlert();
      window.setTimeout(() => setQueuePulse(false), 2500);
    }
    prevQueueCountRef.current = queueCount;
  }, [ticketsByColumn.unassigned.length, isDisplayMode]);



  const moveTargets = useMemo((): { target: DispatchMoveTarget; label: string; icon?: React.ReactNode }[] => [
    { target: 'unassigned', label: 'Move to Queue', icon: <Inbox size={12} /> },
    ...visibleDepartments.map((d) => ({ target: d.id as DispatchMoveTarget, label: `Move to ${d.label}`, icon: <d.icon size={12} /> })),
    { target: 'overnight', label: 'Move to Down in Shop', icon: <Moon size={12} /> },
  ], [visibleDepartments]);

  const renderMoveMenuPortal = () => {
    if (!moveMenuRoId || !moveMenuLayout) return null;
    const ro = orders.find((o) => o.id === moveMenuRoId);
    if (!ro) return null;

    const style: React.CSSProperties =
      moveMenuLayout.placement === 'below'
        ? {
            position: 'fixed',
            zIndex: 9999,
            left: moveMenuLayout.left,
            width: moveMenuLayout.width,
            top: moveMenuLayout.top,
          }
        : {
            position: 'fixed',
            zIndex: 9999,
            left: moveMenuLayout.left,
            width: moveMenuLayout.width,
            top: moveMenuLayout.top,
            transform: 'translateY(-100%)',
          };

    return createPortal(
      <div
        ref={moveMenuPortalRef}
        style={style}
        className="rounded-xl border border-indigo-500/30 bg-slate-950 shadow-2xl shadow-black/50 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        role="menu"
      >
        <p className="px-3 py-2 text-[8px] font-black uppercase tracking-widest text-slate-500 border-b border-white/5">
          Route RO #{ro.roNumber}
        </p>
        <div className="max-h-52 overflow-y-auto py-1">
          {moveTargets.map(({ target, label, icon }) => (
            <button
              key={String(target)}
              type="button"
              role="menuitem"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                handleMoveRo(ro, target);
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-200 hover:bg-indigo-500/15 hover:text-white transition-colors cursor-pointer"
            >
              <span className="text-indigo-400 shrink-0">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </div>,
      document.body
    );
  };

  const renderDisplayCard = (ro: DispatchRepairOrder) => {
    const statusInfo = DISPATCH_STATUS_COLORS[ro.status] || DISPATCH_STATUS_COLORS.WIP;
    const overnight = isOvernightRo(ro, businessDatePst);
    const techLabel = formatTechLabelWithCount(ro.techNumber, dispatchTechRoster, techRoCounts);
    const promiseState = getPromiseTimeState(ro.promiseTimeAt, promiseNowMs);
    return (
      <div
        key={ro.id}
        draggable={isDesktop}
        onDragStart={(e) => handleDragStart(e, ro.id)}
        onDragEnd={handleDragEnd}
        style={{ borderLeftColor: statusInfo.hex, borderLeftWidth: '4px' }}
        className={cn(
          'relative bg-slate-900/90 border border-slate-800 rounded-lg px-2 py-1.5 select-none space-y-0.5',
          overnight && 'ring-1 ring-amber-500/40',
          promiseState?.urgency === 'urgent' && 'ring-1 ring-orange-500/45',
          promiseState?.urgency === 'overdue' && 'ring-1 ring-rose-500/50 animate-pulse',
          moveMenuRoId === ro.id && 'ring-2 ring-indigo-500/50',
          draggingRoId === ro.id && 'opacity-50'
        )}
      >
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] font-black text-white tabular-nums truncate">RO {ro.roNumber}</span>
          {renderIntakeFlagBadge(ro, true)}
        </div>
        <p className="text-[9px] font-bold text-slate-300 truncate uppercase">
          {ro.customerName || ro.model || 'Guest'}
        </p>
        {ro.promiseTimeAt && (
          <DispatchPromiseCountdown
            promiseTimeAt={ro.promiseTimeAt}
            nowMs={promiseNowMs}
            compact
          />
        )}
        <div className="flex items-center justify-between text-[8px] font-mono text-slate-500">
          <span className="truncate">{techLabel}</span>
          <span>…{ro.vinLastEight}</span>
        </div>
      </div>
    );
  };

  const renderRoCard = (ro: DispatchRepairOrder) => {
    const statusInfo = DISPATCH_STATUS_COLORS[ro.status] || DISPATCH_STATUS_COLORS.WIP;
    const isOvernight = isOvernightRo(ro, businessDatePst);
    const promiseState = getPromiseTimeState(ro.promiseTimeAt, promiseNowMs);

    const isInternalAsset =
      ro.accountName?.toLowerCase().includes('hyundai of santa maria') ||
      !!ro.isInternal ||
      ro.customerName?.toLowerCase().includes('hyundai of santa maria');

    const customerLabel = isInternalAsset
      ? `${ro.year || ''} ${ro.model || 'Internal Vehicle'}`.trim()
      : ro.customerName || ro.customerLastName || 'Walk-in guest';

    const vehicleLabel =
      !isInternalAsset && ro.model ? `${ro.year || ''} ${ro.model}`.trim() : null;

    const factChips: { label: string; value: string }[] = [];
    if (isInternalAsset) {
      if (ro.stockNumber) factChips.push({ label: 'Stock', value: ro.stockNumber });
    } else if (ro.tagNumber) {
      factChips.push({ label: 'Tag', value: ro.tagNumber });
    }
    if (ro.vinLastEight) factChips.push({ label: 'VIN', value: `…${ro.vinLastEight}` });
    if (ro.phoneNumber) factChips.push({ label: 'Phone', value: ro.phoneNumber });

    return (
      <div
        key={ro.id}
        data-dispatch-card
        data-dispatch-ro-id={ro.id}
        draggable={isDesktop}
        onDragStart={(e) => handleDragStart(e, ro.id)}
        onDragEnd={handleDragEnd}
        style={{ borderLeftColor: statusInfo.hex, borderLeftWidth: '5px' }}
        className={cn(
          'bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 hover:border-slate-700/80 p-4 rounded-xl space-y-3 shadow-lg hover:shadow-2xl hover:shadow-indigo-950/10 transition-all duration-300 relative group select-none w-full text-slate-100',
          isOvernight && 'ring-1 ring-amber-500/30',
          promiseState?.urgency === 'soon' && 'ring-1 ring-amber-500/25',
          promiseState?.urgency === 'urgent' && 'ring-1 ring-orange-500/40',
          promiseState?.urgency === 'overdue' && 'ring-1 ring-rose-500/45',
          moveMenuRoId === ro.id && 'ring-2 ring-indigo-500/40 border-indigo-500/30',
          lookupRoId === ro.id && 'ring-2 ring-sky-400/70 border-sky-400/40 shadow-sky-950/20',
          draggingRoId === ro.id && 'opacity-50 scale-[0.98]'
        )}
      >
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl font-black text-white tabular-nums tracking-tight leading-none">
                RO {ro.roNumber}
              </span>
              <span
                className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded border"
                style={{
                  color: statusInfo.hex,
                  borderColor: `${statusInfo.hex}55`,
                  backgroundColor: `${statusInfo.hex}18`,
                }}
              >
                {statusInfo.label}
              </span>
              {isOvernight ? (
                <span className="bg-amber-950/80 text-amber-400 border border-amber-900/40 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider">
                  Overnight
                </span>
              ) : null}
              {(ro.isWaiting || ro.isPdl) && renderIntakeFlagBadge(ro)}
            </div>

            {isInternalAsset ? (
              <span className="inline-flex bg-amber-950/80 text-amber-400 border border-amber-900/50 text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md">
                Store inventory / recon
              </span>
            ) : null}

            <div>
              <h3 className="text-sm font-bold tracking-tight text-white truncate">{customerLabel}</h3>
              {vehicleLabel ? (
                <p className="text-xs text-slate-400 truncate">{vehicleLabel}</p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                const card = e.currentTarget.closest('[data-dispatch-card]') as HTMLElement | null;
                toggleMoveMenu(ro.id, card ?? e.currentTarget, e);
              }}
              className="flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-indigo-400 bg-indigo-950/50 border border-indigo-900/40 px-1.5 py-0.5 rounded hover:bg-indigo-900/40"
            >
              <MapPin size={11} /> Move
            </button>

            {confirmDeleteId === ro.id ? (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    handleDeleteCard(ro);
                    setConfirmDeleteId(null);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="text-[9px] font-black uppercase text-rose-400 bg-rose-950/80 border border-rose-900/40 px-1 py-0.5 rounded hover:bg-rose-900/80 transition-all cursor-pointer relative z-20 animate-pulse"
                >
                  Delete?
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setConfirmDeleteId(null);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="text-[9px] font-black uppercase text-slate-400 bg-slate-950 border border-slate-805 px-1 py-0.5 rounded hover:bg-slate-800 transition-all cursor-pointer relative z-20"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setConfirmDeleteId(ro.id);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="text-slate-600 hover:text-rose-450 p-0.5 rounded transition-all duration-200 cursor-pointer relative z-20"
                title="Delete from Board"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>

        {factChips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {factChips.map((chip) => (
              <span
                key={`${chip.label}-${chip.value}`}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-950/70 border border-slate-800 text-[10px]"
              >
                <span className="text-[8px] font-black uppercase tracking-wider text-slate-500">
                  {chip.label}
                </span>
                <span className="font-mono text-slate-200 truncate max-w-[120px]">{chip.value}</span>
              </span>
            ))}
          </div>
        ) : null}

        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="bg-slate-950/30 p-2.5 rounded-lg border border-slate-800/40">
            <DispatchTechSelector
              techNumber={ro.techNumber}
              roster={dispatchTechRoster}
              techRoCounts={techRoCounts}
              onSelect={(techId) => handleUpdateTech(ro, techId)}
            />
            <span className="text-slate-400 text-[10px] block truncate mt-1.5">
              Lane: {dispatchLaneLabel(ro.department)}
            </span>
          </div>

          <div className="bg-slate-950/30 p-2.5 rounded-lg border border-slate-800/40 space-y-2">
            <span className="text-slate-500 block text-[9px] uppercase tracking-wider font-bold">
              Promise time
            </span>
            {ro.promiseTimeAt ? (
              <DispatchPromiseCountdown promiseTimeAt={ro.promiseTimeAt} nowMs={promiseNowMs} />
            ) : null}
            <CardPromiseTimeEditor
              promiseTimeAt={ro.promiseTimeAt}
              onSave={(iso) => handleUpdatePromiseTime(ro.id, iso)}
            />
          </div>
        </div>

        {/* ACTIONS & STATUS SELECT */}
        <div
          className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/60"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="relative inline-flex items-center flex-1 min-w-0 max-w-[155px]">
            <select
              value={ro.status}
              onChange={(e) => handleUpdateStatus(ro.id, e.target.value as typeof ro.status)}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className="text-[10px] font-black uppercase tracking-wider w-full px-2 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 outline-none cursor-pointer focus:border-indigo-500 transition-all appearance-none text-left"
              style={{ borderLeftColor: statusInfo.hex, borderLeftWidth: '3px' }}
            >
              {Object.entries(DISPATCH_STATUS_COLORS).map(([val, info]) => (
                <option 
                  key={val} 
                  value={val} 
                  className="font-bold text-xs bg-slate-950 text-white py-1"
                >
                  {info.label} ({val})
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-slate-500">
              <svg className="h-3 w-3 fill-current" viewBox="0 0 20 20">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
              </svg>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleComplete(ro, true);
            }}
            className="flex items-center gap-1 bg-slate-950 hover:bg-emerald-950/60 hover:text-emerald-400 border border-slate-800 hover:border-emerald-900/60 px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all duration-300 select-none cursor-pointer"
          >
            <Check size={11} className="text-emerald-500" />
            <span>Done</span>
          </button>
        </div>
      </div>
    );
  };

  const intakeFormElement = (
    <DispatchIntakeForm
      customerFirstName={customerFirstName}
      setCustomerFirstName={setCustomerFirstName}
      customerLastName={customerLastName}
      setCustomerLastName={setCustomerLastName}
      phoneNumber={phoneNumber}
      setPhoneNumber={setPhoneNumber}
      roNumber={roNumber}
      setRoNumber={setRoNumber}
      vinLastEight={vinLastEight}
      setVinLastEight={setVinLastEight}
      techNumber={techNumber}
      setTechNumber={setTechNumber}
      tagNumber={tagNumber}
      setTagNumber={setTagNumber}
      initialStatus={initialStatus}
      setInitialStatus={setInitialStatus}
      isWaiting={isWaiting}
      setIsWaiting={setIsWaiting}
      isPdl={isPdl}
      setIsPdl={setIsPdl}
      promiseDate={promiseDate}
      setPromiseDate={(value) => {
        setPromiseDate(value);
        if (promiseTimeError) setPromiseTimeError(null);
      }}
      promiseTime={promiseTime}
      setPromiseTime={(value) => {
        setPromiseTime(value);
        if (promiseTimeError) setPromiseTimeError(null);
      }}
      promiseTimeError={promiseTimeError}
      submitting={submitting}
      selectedCustomer={selectedCustomer}
      setSelectedCustomer={setSelectedCustomer}
      matchCandidates={matchCandidates}
      dispatchTechRoster={dispatchTechRoster}
      techRoCounts={techRoCounts}
      onSubmit={handleSubmitIntake}
    />
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 text-slate-200">
      {isPreviewMode && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-[11px] text-amber-100">
          <span className="font-black uppercase tracking-wider text-amber-300">Preview mode</span>
          <span className="text-amber-200/80">
            {' '}
            — sample data only, no login required. Use{' '}
            <code className="text-amber-100">npm run dev:preview</code>, add{' '}
            <code className="text-amber-100">?preview=true</code> to the URL, or set{' '}
            <code className="text-amber-100">VITE_PREVIEW_MODE=true</code> in{' '}
            <code className="text-amber-100">.env.local</code>.
          </span>
        </div>
      )}
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.25em] block">Automated Dispatch System</span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight uppercase">Departmental Dispatch Board</h1>
          <p className="text-slate-400 text-xs font-medium">
            Streamlining shop capacity by routing tickets structurally across production department bays.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <DispatchRoSearch
            orders={orders}
            selectedRoId={lookupRoId}
            onSelectRo={(ro) => setLookupRoId(ro.id)}
            onClear={() => setLookupRoId(null)}
          />
          {showTodayLoad && (
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-[10px] font-black uppercase tracking-wider">
              <Calendar size={13} className="text-indigo-400 shrink-0" />
              <span className="text-slate-400">Today</span>
              <span className="text-white tabular-nums">{activeTickets.filter((o) => o.dateCreated === businessDatePst).length}</span>
              <span className="text-slate-600">active ROs</span>
              <span className="text-slate-600">·</span>
              <span className="text-emerald-400 tabular-nums">{todayApptCount}</span>
              <span className="text-slate-500">appts logged</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400">goal {apptGoal}</span>
            </div>
          )}
          <button
            type="button"
            onClick={openDisplayMode}
            disabled={loading || showCompleted}
            className="btn-secondary border text-xs gap-1.5 font-bold uppercase tracking-wider py-2 px-4 rounded-xl transition-all bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:border-indigo-500/40 disabled:opacity-40"
          >
            <Monitor size={13} />
            <span>Display Preview</span>
          </button>
          
          <button 
            onClick={() => setShowCompleted(!showCompleted)}
            className={cn(
              "btn-secondary border text-xs gap-1.5 font-bold uppercase tracking-wider py-2 px-4 rounded-xl transition-all",
              showCompleted 
                ? "bg-emerald-950/20 text-emerald-400 border-emerald-500/30" 
                : "bg-slate-900 border-slate-800 text-slate-300 hover:text-white"
            )}
          >
            <CheckSquare size={13} />
            <span>{showCompleted ? "View Active Board" : `View Completed Logs (${completedTickets.length})`}</span>
          </button>
        </div>
      </div>

      {!loading && lookupRo ? (
        <div className="rounded-2xl border border-sky-500/30 bg-sky-950/15 p-4 sm:p-5 space-y-4 shadow-lg shadow-sky-950/10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">RO lookup</p>
              <h2 className="text-lg font-black text-white uppercase tracking-tight">
                RO {lookupRo.roNumber}
                <span className="text-slate-500 font-bold normal-case tracking-normal text-sm ml-2">
                  {dispatchLaneLabel(lookupRo.department)}
                </span>
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setLookupRoId(null)}
              className="text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-white px-3 py-2 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors"
            >
              Close lookup
            </button>
          </div>
          {lookupRo.isCompleted ? (
            <div className="max-w-xl rounded-xl border border-emerald-500/20 bg-slate-950/60 p-4 space-y-4">
              <p className="text-xs text-slate-400">
                This repair order is marked complete. Restore it to the active board to change status or route it again.
              </p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">Customer</span>
                  <span className="text-white font-bold">{lookupRo.customerName || displayCustomerLastName(lookupRo)}</span>
                </div>
                <div>
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">Tech</span>
                  <span className="text-white font-mono">{lookupRo.techNumber}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  handleToggleComplete(lookupRo, false);
                  setShowCompleted(false);
                }}
                className="bg-indigo-950 text-indigo-300 hover:bg-indigo-900 border border-indigo-900/40 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors"
              >
                Restore to active board
              </button>
            </div>
          ) : (
            <div className="max-w-xl">{renderRoCard(lookupRo)}</div>
          )}
        </div>
      ) : null}

      {!loading && !showCompleted && (
        <>
          <div className="hidden md:block">
            <DispatchMetricsBar
              orders={orders}
              currentSystemDate={businessDatePst}
              isOvernight={(ro) => isOvernightRo(ro, businessDatePst)}
              dispatchTechRoster={dispatchTechRoster}
              techRoCounts={techRoCounts}
            />
          </div>
          <div className="md:hidden">
            <DispatchMetricsBar
              orders={orders}
              currentSystemDate={businessDatePst}
              isOvernight={(ro) => isOvernightRo(ro, businessDatePst)}
              dispatchTechRoster={dispatchTechRoster}
              techRoCounts={techRoCounts}
              compact
            />
          </div>
        </>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <RefreshCw className="animate-spin text-indigo-500" size={32} />
          <p className="text-slate-500 text-xs font-black uppercase tracking-wider">Synchronizing Department Lanes...</p>
        </div>
      ) : showCompleted ? (
        /* Completed Tickets Log view */
        <div className="bg-slate-900 border border-slate-850 p-6 rounded-2xl space-y-4">
          <h2 className="text-sm font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
            <CheckCircle2 className="text-emerald-500" size={16} />
            Completed Dispatch History
          </h2>
          {completedTickets.length === 0 ? (
            <p className="text-slate-500 text-xs font-mono py-6 text-center border border-dashed border-slate-850 rounded-xl">
              No completed repair orders logged yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-400">
                <thead>
                  <tr className="border-b border-slate-810 text-[9.5px] font-black uppercase text-slate-500 tracking-wider">
                    <th className="py-2.5 px-3">RO #</th>
                    <th className="py-2.5 px-3">Tech #</th>
                    <th className="py-2.5 px-3">Last Name</th>
                    <th className="py-2.5 px-3">Routed Dept</th>
                    <th className="py-2.5 px-3">Date Completed</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {completedTickets.map(ro => {
                    const deptLabel = dispatchLaneLabel(ro.department);
                    return (
                      <tr key={ro.id} className="hover:bg-slate-850/30 transition-colors">
                        <td className="py-3 px-3 font-bold text-slate-200">RO {ro.roNumber}</td>
                        <td className="py-3 px-3 font-mono font-bold text-slate-300">{ro.techNumber}</td>
                        <td className="py-3 px-3 font-bold text-slate-300 uppercase">{displayCustomerLastName(ro)}</td>
                        <td className="py-3 px-3">
                          <span className="bg-slate-950 text-slate-400 px-2 py-1 rounded-md text-[10px] font-bold uppercase border border-slate-800">
                            {deptLabel}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-500 font-mono">{new Date(ro.lastUpdated).toLocaleDateString()}</td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => handleToggleComplete(ro, false)}
                            className="bg-indigo-950 text-indigo-400 hover:bg-indigo-900 border border-indigo-900/40 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors"
                          >
                            Restore Card
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Horizontal top intake + scrollable list and vertical stack of department rows */
        <>
        <div className="hidden md:block space-y-6 w-full pb-10">
          
          {/* TOP CONTAINER — Intake & Waiting Queue */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 w-full items-stretch">

            {/* Fast Intake */}
            <div className="lg:col-span-5">
              <DispatchIntakePanel>{intakeFormElement}</DispatchIntakePanel>
            </div>

            {/* Waiting Queue */}
            <div
              className={cn(
                'lg:col-span-7 relative overflow-visible rounded-2xl border flex flex-col min-h-[280px] transition-all duration-300 shadow-xl shadow-black/20',
                'border-white/[0.08] bg-gradient-to-br from-slate-900/90 via-slate-950 to-slate-900/80',
                dragOverLane === 'unassigned' && 'ring-2 ring-indigo-500/50',
                queuePulse && 'ring-2 ring-amber-400/60 animate-pulse'
              )}
              {...laneDropProps('unassigned')}
            >
              <div className="pointer-events-none absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-violet-500/5 blur-3xl" />
              <div className="relative p-5 sm:p-6 flex flex-col flex-1 gap-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn(
                      'p-2.5 rounded-xl border shrink-0',
                      ticketsByColumn.unassigned.length > 0
                        ? 'bg-amber-500/10 border-amber-400/25'
                        : 'bg-slate-800/50 border-slate-700/50'
                    )}>
                      <Inbox size={16} className={ticketsByColumn.unassigned.length > 0 ? 'text-amber-300' : 'text-slate-500'} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-[11px] font-black text-white uppercase tracking-[0.2em] truncate">Waiting Queue</h2>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">Tap a card → Move to route into a production lane</p>
                    </div>
                  </div>
                  <div className={cn(
                    'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-black tabular-nums',
                    ticketsByColumn.unassigned.length > 0
                      ? 'bg-amber-950/40 border-amber-500/30 text-amber-200'
                      : 'bg-slate-950/80 border-slate-800 text-slate-500'
                  )}>
                    <span className="text-[8px] uppercase tracking-widest opacity-70">Queue</span>
                    <span className="text-sm leading-none">{ticketsByColumn.unassigned.length}</span>
                  </div>
                </div>

                <div className={cn(
                  'flex-1 flex gap-3 overflow-x-auto overflow-y-visible py-2 px-2 items-stretch min-h-[160px] rounded-xl transition-colors',
                  ticketsByColumn.unassigned.length === 0
                    ? 'border border-dashed border-slate-800/80 bg-slate-950/30'
                    : 'border border-slate-800/60 bg-slate-950/40'
                )}>
                  {ticketsByColumn.unassigned.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 py-8 px-4 text-center">
                      <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center">
                        <CheckCircle2 size={22} className="text-emerald-500/70" />
                      </div>
                      <div>
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Queue is clear</p>
                        <p className="text-[10px] text-slate-600 mt-1 max-w-[220px]">All tickets are routed to production lanes.</p>
                      </div>
                    </div>
                  ) : (
                    ticketsByColumn.unassigned.map((ro) => (
                      <div key={ro.id} className="w-[260px] sm:w-[280px] shrink-0 py-1">
                        {renderRoCard(ro)}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

          </div>

          {/* LOWER CANVAS: production departments as rows (respects hidden lanes) */}
          <div className="flex flex-col gap-4 w-full">
            {visibleDepartments.map((dept) => {
              const list = ticketsByColumn[dept.id] || [];
              return (
                <div 
                  key={dept.id} 
                  className={cn(
                    "bg-gradient-to-r from-slate-900/60 to-slate-900/30 border border-slate-850 rounded-2xl p-4.5 flex flex-col md:flex-row md:items-center gap-5 w-full transition-all duration-300 shadow-md relative",
                    list.length > 0 ? "border-slate-800/80 bg-slate-900/40" : "border-slate-900/60",
                    dragOverLane === dept.id && "ring-2 ring-indigo-500/40 border-indigo-500/30"
                  )}
                  {...laneDropProps(dept.id)}
                >
                  {/* Department Title, Icon, and Ticket Count */}
                  <div className="flex items-center justify-between md:flex-col md:items-start md:justify-center gap-1.5 md:w-48 shrink-0 border-b md:border-b-0 md:border-r border-slate-800/80 pb-3 md:pb-0 md:pr-4 select-none">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-slate-950 border border-slate-800/85 rounded-lg text-indigo-400">
                        <dept.icon size={13} />
                      </div>
                      <h3 className="text-xs font-black text-slate-100 uppercase tracking-widest font-sans">
                        {dept.label}
                      </h3>
                    </div>
                    {(() => {
                      const cap = laneCapacity[dept.id];
                      const atCap = cap > 0 && list.length >= cap;
                      return (
                        <span className={cn(
                          'border px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider tabular-nums',
                          atCap ? 'bg-rose-950/50 text-rose-400 border-rose-900/50' : 'bg-slate-950 text-slate-400 border-slate-800'
                        )}>
                          {cap > 0 ? `${list.length}/${cap}` : list.length} {list.length === 1 ? 'ticket' : 'tickets'}
                          {atCap ? ' · FULL' : ''}
                        </span>
                      );
                    })()}
                  </div>

                  {/* Horizontal Scroll Area for active cards */}
                  <div className="flex-1 flex gap-4 overflow-x-auto pb-2 min-h-[150px] items-center scrollbar-thin">
                    {list.length === 0 ? (
                      <div className="flex items-center gap-2 text-slate-600 py-6 px-3 border border-dashed border-slate-950/60 rounded-xl w-full">
                        <HelpCircle size={14} className="text-slate-700" />
                        <p className="text-[10px] font-black uppercase tracking-wider">Vacant lane — tap a queue card and Move to schedule</p>
                      </div>
                    ) : (
                      list.map((ro) => (
                        <div key={ro.id} className="w-[285px] shrink-0">
                          {renderRoCard(ro)}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* QUICK LEGEND & COLOR CODE */}
          <div className="bg-slate-900 border border-slate-850 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 select-none">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Status Color Codes</span>
              <p className="text-[9px] text-slate-600 font-medium">Desktop: drag cards between lanes · Mobile: tap card → Move</p>
            </div>
            <div className="flex flex-wrap gap-4 text-[10px] font-bold">
              {Object.entries(DISPATCH_STATUS_COLORS).map(([code, info]) => (
                <div key={code} className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-850">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: info.hex }}></span>
                  <span className="text-slate-400 font-bold uppercase text-[9px] tracking-wider">{info.label} ({code})</span>
                </div>
              ))}
              <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-850">
                <span className="text-slate-400 font-bold uppercase text-[9px] tracking-wider">Promise: {PROMISE_BUSINESS_HOURS_LABEL} · green &gt;1h · amber &lt;1h · orange &lt;15m · red overdue</span>
              </div>
            </div>
          </div>

        </div>

        <DispatchMobileBoard
          activeTab={mobileLaneTab}
          onTabChange={setMobileLaneTab}
          displayColumns={productionDisplayColumns}
          ticketsByColumn={ticketsByColumn}
          laneCapacity={laneCapacity}
          renderCard={renderRoCard}
          intakeForm={<DispatchIntakePanel>{intakeFormElement}</DispatchIntakePanel>}
        />
        </>
      )}

      {isDisplayMode && (
        <div
          className="fixed inset-0 z-[9999] bg-slate-950 text-slate-100 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="Dispatch display preview"
        >
          <div className="relative w-full h-full max-w-[1920px] max-h-[1080px] flex flex-col p-2 box-border">
            <button
              type="button"
              onClick={closeDisplayMode}
              className={cn(
                'absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700 text-[9px] font-black uppercase tracking-wider text-slate-400 hover:text-white hover:border-slate-500 transition-opacity duration-500',
                showTvExit ? 'opacity-100' : 'opacity-0 pointer-events-none'
              )}
              title="Exit display preview (Esc)"
            >
              <X size={12} />
              Exit
            </button>

            <div
              className={cn(
                'grid gap-1.5 flex-1 min-h-0 w-full h-full',
                productionDisplayColumns.length <= 4
                  ? 'grid-cols-4'
                  : productionDisplayColumns.length <= 6
                    ? 'grid-cols-6'
                    : 'grid-cols-8'
              )}
            >
              {productionDisplayColumns.map((col, columnIndex) => {
                const list = ticketsByColumn[col.id] || [];
                const cap = laneCapacity[col.id];
                const atCap = cap > 0 && list.length >= cap;
                const isCycleFocus = columnIndex === displayCycleIndex;
                return (
                  <div
                    key={col.id}
                    className={cn(
                      'flex flex-col min-w-0 min-h-0 rounded-xl border bg-slate-900/60 overflow-hidden transition-all duration-500',
                      isCycleFocus ? 'ring-2 ring-indigo-400/50 border-indigo-400/40 scale-[1.01]' : 'border-slate-800/80'
                    )}
                    {...laneDropProps(col.id)}
                  >
                    <div className="shrink-0 px-2 py-1.5 border-b border-slate-800/80 bg-slate-950/80 flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1 min-w-0">
                        <col.icon size={11} className="text-indigo-400 shrink-0" />
                        <span className="text-[9px] font-black uppercase tracking-wide truncate leading-tight">
                          {col.shortLabel}
                        </span>
                      </div>
                      <span
                        className={cn(
                          'text-[8px] font-black tabular-nums px-1.5 py-0.5 rounded shrink-0',
                          atCap ? 'bg-rose-950 text-rose-400' : 'bg-slate-800 text-slate-400'
                        )}
                      >
                        {cap > 0 ? `${list.length}/${cap}` : list.length}
                      </span>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-1.5 space-y-1.5">
                      {list.length === 0 ? (
                        <p className="text-[8px] font-bold uppercase tracking-wider text-slate-600 text-center py-4 px-1">
                          —
                        </p>
                      ) : (
                        list.map((ro) => renderDisplayCard(ro))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {renderMoveMenuPortal()}
    </div>
  );
}

