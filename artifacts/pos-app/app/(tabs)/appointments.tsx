import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useDatabase } from "@/context/DatabaseCore";
import { Appointment, AppointmentStatus, Customer, PosTable, Product, Rider } from "@/types";

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  scheduled: "#4F8EF7",
  "in-progress": "#F39C12",
  completed: "#2ECC71",
  cancelled: "#E74C3C",
  "no-show": "#888888",
};

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Scheduled",
  "in-progress": "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
  "no-show": "No Show",
};

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DURATION_OPTIONS = [30, 45, 60, 90, 120];

const TIME_SLOTS: { label: string; minutes: number }[] = [];
for (let h = 8; h <= 21; h++) {
  for (const m of [0, 30]) {
    if (h === 21 && m === 30) break;
    const period = h < 12 ? "AM" : "PM";
    const dh = h === 0 ? 12 : h <= 12 ? h : h - 12;
    TIME_SLOTS.push({ label: `${dh}:${m === 0 ? "00" : "30"} ${period}`, minutes: h * 60 + m });
  }
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isToday(d: Date) {
  return isSameDay(d, new Date());
}

function formatTime(ms: number) {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h < 12 ? "AM" : "PM";
  const dh = h === 0 ? 12 : h <= 12 ? h : h - 12;
  return `${dh}:${m.toString().padStart(2, "0")} ${period}`;
}

function addMinutes(ms: number, mins: number) {
  return formatTime(ms + mins * 60000);
}

function minutesToEpoch(base: Date, minutes: number): number {
  const d = new Date(base);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d.getTime();
}

function weekDaysFor(weekOffset: number): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const base = new Date(today);
  base.setDate(today.getDate() + weekOffset * 7);
  const dow = base.getDay();
  const monday = new Date(base);
  monday.setDate(base.getDate() - ((dow + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

interface FormState {
  customerId: string | undefined;
  customerName: string;
  customerPhone: string;
  stylistId: string | undefined;
  stylistName: string;
  serviceName: string;
  chairId: string | undefined;
  chairName: string;
  timeMinutes: number;
  durationMinutes: number;
  notes: string;
}

function defaultForm(): FormState {
  return {
    customerId: undefined, customerName: "", customerPhone: "",
    stylistId: undefined, stylistName: "",
    serviceName: "",
    chairId: undefined, chairName: "",
    timeMinutes: 10 * 60,
    durationMinutes: 60,
    notes: "",
  };
}

function AppointmentCard({
  appt,
  onStatusChange,
  onEdit,
  onCheckIn,
}: {
  appt: Appointment;
  onStatusChange: (id: string, status: AppointmentStatus) => void;
  onEdit: (appt: Appointment) => void;
  onCheckIn?: (appt: Appointment) => void;
}) {
  const color = STATUS_COLORS[appt.status];
  const isActive = appt.status === "scheduled" || appt.status === "in-progress";

  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      <View style={styles.cardInner}>
        <View style={styles.timeCol}>
          <Text style={styles.cardTime}>{formatTime(appt.appointmentDate)}</Text>
          <Text style={styles.cardEndTime}>{addMinutes(appt.appointmentDate, appt.durationMinutes)}</Text>
          <View style={styles.durationTag}>
            <Text style={styles.durationTagText}>
              {appt.durationMinutes < 60 ? `${appt.durationMinutes}m` : appt.durationMinutes === 60 ? "1h" : appt.durationMinutes === 90 ? "1.5h" : "2h"}
            </Text>
          </View>
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.cardBody}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardCustomer} numberOfLines={1}>
              {appt.customerName || "Walk-in"}
            </Text>
            <View style={[styles.statusPill, { backgroundColor: color + "22", borderColor: color }]}>
              <Text style={[styles.statusPillText, { color }]}>{STATUS_LABELS[appt.status]}</Text>
            </View>
          </View>

          {appt.customerPhone ? (
            <Text style={styles.cardMeta}>
              <Feather name="phone" size={11} color="#666" /> {appt.customerPhone}
            </Text>
          ) : null}
          {appt.stylistName ? (
            <Text style={styles.cardMeta}>
              <Feather name="user" size={11} color="#666" /> {appt.stylistName}
            </Text>
          ) : null}
          {appt.serviceName ? (
            <Text style={styles.cardMeta}>
              <Feather name="scissors" size={11} color="#666" /> {appt.serviceName}
            </Text>
          ) : null}
          {appt.chairName ? (
            <Text style={styles.cardMeta}>
              <Feather name="grid" size={11} color="#666" /> {appt.chairName}
            </Text>
          ) : null}
          {appt.notes ? (
            <Text style={styles.cardNotes} numberOfLines={2}>{appt.notes}</Text>
          ) : null}

          {isActive && (
            <View style={styles.cardActions}>
              {appt.status === "scheduled" && (
                <>
                  <Pressable
                    style={[styles.chip, { borderColor: "#F39C12", backgroundColor: "#F39C1218" }]}
                    onPress={() => onCheckIn ? onCheckIn(appt) : onStatusChange(appt.id, "in-progress")}
                  >
                    <Feather name="play" size={12} color="#F39C12" />
                    <Text style={[styles.chipText, { color: "#F39C12" }]}>Check In</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.chip, { borderColor: "#4F8EF7", backgroundColor: "#4F8EF718" }]}
                    onPress={() => onEdit(appt)}
                  >
                    <Feather name="edit-2" size={12} color="#4F8EF7" />
                    <Text style={[styles.chipText, { color: "#4F8EF7" }]}>Edit</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.chip, { borderColor: "#E74C3C", backgroundColor: "#E74C3C18" }]}
                    onPress={() => onStatusChange(appt.id, "cancelled")}
                  >
                    <Feather name="x" size={12} color="#E74C3C" />
                    <Text style={[styles.chipText, { color: "#E74C3C" }]}>Cancel</Text>
                  </Pressable>
                </>
              )}
              {appt.status === "in-progress" && (
                <>
                  <Pressable
                    style={[styles.chip, { borderColor: "#2ECC71", backgroundColor: "#2ECC7118" }]}
                    onPress={() => onStatusChange(appt.id, "completed")}
                  >
                    <Feather name="check" size={12} color="#2ECC71" />
                    <Text style={[styles.chipText, { color: "#2ECC71" }]}>Complete</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.chip, { borderColor: "#888", backgroundColor: "#88888818" }]}
                    onPress={() => onStatusChange(appt.id, "no-show")}
                  >
                    <Feather name="user-x" size={12} color="#888" />
                    <Text style={[styles.chipText, { color: "#888" }]}>No Show</Text>
                  </Pressable>
                </>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

export default function AppointmentsScreen() {
  const router = useRouter();
  const {
    loadAppointments, createAppointment, updateAppointment, deleteAppointment,
    loadRiders, loadCustomers, loadTables, loadProducts,
  } = useDatabase();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekOffset, setWeekOffset] = useState(0);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [tables, setTables] = useState<PosTable[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [formDate, setFormDate] = useState(new Date());
  const [formWeekOffset, setFormWeekOffset] = useState(0);
  const [showCustSearch, setShowCustSearch] = useState(false);
  const [custQuery, setCustQuery] = useState("");
  const [showServicePicker, setShowServicePicker] = useState(false);
  const [serviceQuery, setServiceQuery] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const appts = await loadAppointments(selectedDate.getTime());
    setAppointments(appts);
  }, [loadAppointments, selectedDate]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  useEffect(() => { refresh(); }, [selectedDate]);

  useEffect(() => {
    loadRiders().then(setRiders);
    loadCustomers().then(setCustomers);
    loadTables().then(setTables);
    loadProducts().then(setProducts);
  }, []);

  const weekDays = useMemo(() => weekDaysFor(weekOffset), [weekOffset]);
  const formWeekDays = useMemo(() => weekDaysFor(formWeekOffset), [formWeekOffset]);

  const dayLabel = () => {
    const now = new Date();
    if (isSameDay(selectedDate, now)) return "Today";
    const tom = new Date(now); tom.setDate(now.getDate() + 1);
    if (isSameDay(selectedDate, tom)) return "Tomorrow";
    return `${DAY_ABBR[selectedDate.getDay()]}, ${selectedDate.getDate()} ${MONTH_ABBR[selectedDate.getMonth()]}`;
  };

  const openNew = () => {
    setEditingAppt(null);
    setForm(defaultForm());
    setFormDate(new Date(selectedDate));
    setFormWeekOffset(weekOffset);
    setCustQuery(""); setShowCustSearch(false);
    setServiceQuery(""); setShowServicePicker(false);
    setShowModal(true);
  };

  const openEdit = (appt: Appointment) => {
    setEditingAppt(appt);
    const d = new Date(appt.appointmentDate);
    setFormDate(d);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const apptDay = new Date(d); apptDay.setHours(0, 0, 0, 0);
    const diffDays = Math.round((apptDay.getTime() - today.getTime()) / 86400000);
    setFormWeekOffset(Math.floor(diffDays / 7));
    setForm({
      customerId: appt.customerId, customerName: appt.customerName, customerPhone: appt.customerPhone,
      stylistId: appt.stylistId, stylistName: appt.stylistName,
      serviceName: appt.serviceName,
      chairId: appt.chairId, chairName: appt.chairName,
      timeMinutes: d.getHours() * 60 + d.getMinutes(),
      durationMinutes: appt.durationMinutes,
      notes: appt.notes,
    });
    setCustQuery(""); setShowCustSearch(false);
    setServiceQuery(""); setShowServicePicker(false);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.customerName.trim()) return;
    setSaving(true);
    try {
      const apptDate = minutesToEpoch(formDate, form.timeMinutes);
      const payload = {
        customerId: form.customerId,
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim(),
        stylistId: form.stylistId,
        stylistName: form.stylistName,
        serviceName: form.serviceName.trim(),
        chairId: form.chairId,
        chairName: form.chairName,
        appointmentDate: apptDate,
        durationMinutes: form.durationMinutes,
        notes: form.notes.trim(),
      };
      if (editingAppt) {
        await updateAppointment({ ...payload, id: editingAppt.id, status: editingAppt.status, createdAt: editingAppt.createdAt });
      } else {
        await createAppointment({ ...payload, status: "scheduled" });
      }
      setShowModal(false);
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id: string, status: AppointmentStatus) => {
    const appt = appointments.find((a) => a.id === id);
    if (!appt) return;
    await updateAppointment({ ...appt, status });
    await refresh();
  };

  const handleCheckIn = async (appt: Appointment) => {
    await updateAppointment({ ...appt, status: "in-progress" });
    await refresh();
    router.navigate({
      pathname: "/(tabs)",
      params: {
        apptId: appt.id,
        apptCustomerId: appt.customerId ?? "",
        apptCustomerName: appt.customerName,
        apptCustomerPhone: appt.customerPhone,
        apptStylistId: appt.stylistId ?? "",
        apptStylistName: appt.stylistName,
        apptServiceName: appt.serviceName,
        apptChairId: appt.chairId ?? "",
      },
    });
  };

  const handleDelete = async (id: string) => {
    await deleteAppointment(id);
    setShowModal(false);
    await refresh();
  };

  const selectCustomer = (c: Customer) => {
    setForm((f) => ({ ...f, customerId: c.id, customerName: c.name, customerPhone: c.phone }));
    setShowCustSearch(false); setCustQuery("");
  };

  const filteredCustomers = custQuery.trim()
    ? customers.filter((c) =>
        c.name.toLowerCase().includes(custQuery.toLowerCase()) || c.phone.includes(custQuery)
      )
    : customers.slice(0, 12);

  const filteredServices = useMemo(() => {
    const q = serviceQuery.trim().toLowerCase();
    if (!q) return products.slice(0, 20);
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 20);
  }, [products, serviceQuery]);

  const selectService = useCallback((p: Product) => {
    setForm((f) => ({
      ...f,
      serviceName: p.name,
      ...(p.durationMinutes ? { durationMinutes: p.durationMinutes } : {}),
    }));
    setShowServicePicker(false);
    setServiceQuery("");
  }, []);

  const pendingCount = appointments.filter(
    (a) => a.status === "scheduled" || a.status === "in-progress"
  ).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Feather name="calendar" size={18} color="#4F8EF7" />
          <Text style={styles.headerTitle}>Appointments</Text>
          {pendingCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pendingCount}</Text>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          <Pressable
            style={styles.todayBtn}
            onPress={() => { setSelectedDate(new Date()); setWeekOffset(0); }}
          >
            <Text style={styles.todayBtnText}>Today</Text>
          </Pressable>
          <Pressable style={styles.newBtn} onPress={openNew}>
            <Feather name="plus" size={16} color="#FFF" />
            <Text style={styles.newBtnText}>New</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.weekStrip}>
        <Pressable style={styles.weekArrow} onPress={() => setWeekOffset((w) => w - 1)}>
          <Feather name="chevron-left" size={20} color="#666" />
        </Pressable>
        {weekDays.map((d, i) => {
          const sel = isSameDay(d, selectedDate);
          const tod = isToday(d);
          return (
            <Pressable
              key={i}
              style={[styles.dayPill, sel && styles.dayPillSel]}
              onPress={() => setSelectedDate(new Date(d))}
            >
              <Text style={[styles.dayAbbr, sel && styles.dayAbbrSel, tod && !sel && { color: "#4F8EF7" }]}>
                {DAY_ABBR[d.getDay()].slice(0, 2)}
              </Text>
              <Text style={[styles.dayNum, sel && styles.dayNumSel, tod && !sel && { color: "#4F8EF7" }]}>
                {d.getDate()}
              </Text>
            </Pressable>
          );
        })}
        <Pressable style={styles.weekArrow} onPress={() => setWeekOffset((w) => w + 1)}>
          <Feather name="chevron-right" size={20} color="#666" />
        </Pressable>
      </View>

      <View style={styles.dayLabelRow}>
        <Text style={styles.dayLabel}>{dayLabel()}</Text>
        <Text style={styles.apptCount}>
          {appointments.length} appointment{appointments.length !== 1 ? "s" : ""}
        </Text>
      </View>

      {appointments.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="calendar" size={52} color="#2A2D35" />
          <Text style={styles.emptyTitle}>No appointments</Text>
          <Text style={styles.emptySubtitle}>
            Tap "+ New" to book an appointment for {dayLabel().toLowerCase()}.
          </Text>
          <Pressable style={styles.emptyNewBtn} onPress={openNew}>
            <Feather name="plus" size={15} color="#FFF" />
            <Text style={styles.emptyNewBtnText}>Book Appointment</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={appointments}
          keyExtractor={(a) => a.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <AppointmentCard appt={item} onStatusChange={handleStatusChange} onEdit={openEdit} onCheckIn={handleCheckIn} />
          )}
        />
      )}

      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalWrapper}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowModal(false)} style={styles.modalCancelBtn}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>
              {editingAppt ? "Edit Appointment" : "New Appointment"}
            </Text>
            <Pressable
              onPress={handleSave}
              style={[styles.modalSaveBtn, saving && { opacity: 0.5 }]}
              disabled={saving}
            >
              <Text style={styles.modalSaveText}>{saving ? "Saving…" : "Save"}</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.sectionLabel}>CUSTOMER</Text>
            <View style={styles.formCard}>
              {showCustSearch ? (
                <>
                  <View style={styles.searchRow}>
                    <Feather name="search" size={15} color="#666" />
                    <TextInput
                      style={styles.searchInput}
                      value={custQuery}
                      onChangeText={setCustQuery}
                      placeholder="Name or phone…"
                      placeholderTextColor="#555"
                      autoFocus
                    />
                    <Pressable onPress={() => { setShowCustSearch(false); setCustQuery(""); }}>
                      <Feather name="x" size={15} color="#666" />
                    </Pressable>
                  </View>
                  <View style={styles.custResults}>
                    {filteredCustomers.map((c) => (
                      <Pressable key={c.id} style={styles.custRow} onPress={() => selectCustomer(c)}>
                        <Feather name="user" size={13} color="#555" />
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <Text style={styles.custName}>{c.name}</Text>
                          {c.phone ? <Text style={styles.custPhone}>{c.phone}</Text> : null}
                        </View>
                        <Feather name="chevron-right" size={13} color="#444" />
                      </Pressable>
                    ))}
                    {filteredCustomers.length === 0 && (
                      <Text style={styles.noResults}>No customers found</Text>
                    )}
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.formRow}>
                    <Text style={styles.formLabel}>Name *</Text>
                    <View style={styles.formInputRow}>
                      <TextInput
                        style={[styles.formInput, { flex: 1 }]}
                        value={form.customerName}
                        onChangeText={(v) =>
                          setForm((f) => ({ ...f, customerName: v, customerId: undefined }))
                        }
                        placeholder="Customer name"
                        placeholderTextColor="#555"
                      />
                      <Pressable
                        onPress={() => setShowCustSearch(true)}
                        style={styles.searchIconBtn}
                      >
                        <Feather name="search" size={15} color="#4F8EF7" />
                      </Pressable>
                    </View>
                  </View>
                  <View style={[styles.formRow, { borderTopWidth: 1, borderTopColor: "#252830" }]}>
                    <Text style={styles.formLabel}>Phone</Text>
                    <TextInput
                      style={styles.formInput}
                      value={form.customerPhone}
                      onChangeText={(v) => setForm((f) => ({ ...f, customerPhone: v }))}
                      placeholder="+971 50 000 0000"
                      placeholderTextColor="#555"
                      keyboardType="phone-pad"
                    />
                  </View>
                </>
              )}
            </View>

            <Text style={styles.sectionLabel}>STYLIST</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.pillScroll}
              contentContainerStyle={styles.pillContent}
            >
              <Pressable
                style={[styles.pill, !form.stylistId && styles.pillSel]}
                onPress={() => setForm((f) => ({ ...f, stylistId: undefined, stylistName: "" }))}
              >
                <Text style={[styles.pillText, !form.stylistId && styles.pillTextSel]}>Any</Text>
              </Pressable>
              {riders.filter((s) => s.active).map((s) => (
                <Pressable
                  key={s.id}
                  style={[styles.pill, form.stylistId === s.id && styles.pillSel]}
                  onPress={() => setForm((f) => ({ ...f, stylistId: s.id, stylistName: s.name }))}
                >
                  <Text style={[styles.pillText, form.stylistId === s.id && styles.pillTextSel]}>
                    {s.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.sectionLabel}>SERVICE</Text>
            <View style={styles.formCard}>
              {showServicePicker ? (
                <>
                  <View style={styles.searchRow}>
                    <Feather name="search" size={15} color="#666" />
                    <TextInput
                      style={styles.searchInput}
                      value={serviceQuery}
                      onChangeText={setServiceQuery}
                      placeholder="Search services…"
                      placeholderTextColor="#555"
                      autoFocus
                    />
                    <Pressable onPress={() => { setShowServicePicker(false); setServiceQuery(""); }}>
                      <Feather name="x" size={15} color="#666" />
                    </Pressable>
                  </View>
                  <View>
                    {filteredServices.map((p) => (
                      <Pressable key={p.id} style={styles.custRow} onPress={() => selectService(p)}>
                        <Feather name="scissors" size={13} color="#555" />
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <Text style={styles.custName}>{p.name}</Text>
                          {p.durationMinutes ? (
                            <Text style={styles.custPhone}>{p.durationMinutes} min</Text>
                          ) : null}
                        </View>
                        <Feather name="chevron-right" size={13} color="#444" />
                      </Pressable>
                    ))}
                    {filteredServices.length === 0 && (
                      <Text style={styles.noResults}>No services found</Text>
                    )}
                  </View>
                </>
              ) : (
                <View style={styles.formRow}>
                  <Text style={styles.formLabel}>Service</Text>
                  <View style={styles.formInputRow}>
                    <Text
                      style={[styles.formInput, { flex: 1, paddingVertical: 0, color: form.serviceName ? "#FFF" : "#555" }]}
                      numberOfLines={1}
                    >
                      {form.serviceName || "Select a service…"}
                    </Text>
                    <Pressable onPress={() => setShowServicePicker(true)} style={styles.searchIconBtn}>
                      <Feather name="search" size={15} color="#4F8EF7" />
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            <Text style={styles.sectionLabel}>DATE</Text>
            <View style={styles.weekStripCard}>
              <Pressable onPress={() => setFormWeekOffset((w) => w - 1)} style={styles.weekArrow}>
                <Feather name="chevron-left" size={18} color="#666" />
              </Pressable>
              {formWeekDays.map((d, i) => {
                const sel = isSameDay(d, formDate);
                const tod = isToday(d);
                return (
                  <Pressable
                    key={i}
                    style={[styles.dayPillSm, sel && styles.dayPillSmSel]}
                    onPress={() => setFormDate(new Date(d))}
                  >
                    <Text
                      style={[styles.dayAbbrSm, sel && styles.dayAbbrSmSel, tod && !sel && { color: "#4F8EF7" }]}
                    >
                      {DAY_ABBR[d.getDay()][0]}
                    </Text>
                    <Text
                      style={[styles.dayNumSm, sel && styles.dayNumSmSel, tod && !sel && { color: "#4F8EF7" }]}
                    >
                      {d.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable onPress={() => setFormWeekOffset((w) => w + 1)} style={styles.weekArrow}>
                <Feather name="chevron-right" size={18} color="#666" />
              </Pressable>
            </View>

            <Text style={styles.sectionLabel}>TIME</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.pillScroll}
              contentContainerStyle={styles.pillContent}
            >
              {TIME_SLOTS.map((slot) => (
                <Pressable
                  key={slot.minutes}
                  style={[styles.timePill, form.timeMinutes === slot.minutes && styles.timePillSel]}
                  onPress={() => setForm((f) => ({ ...f, timeMinutes: slot.minutes }))}
                >
                  <Text
                    style={[
                      styles.timePillText,
                      form.timeMinutes === slot.minutes && styles.timePillTextSel,
                    ]}
                  >
                    {slot.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.sectionLabel}>DURATION</Text>
            <View style={styles.durationRow}>
              {DURATION_OPTIONS.map((d) => (
                <Pressable
                  key={d}
                  style={[styles.durationBtn, form.durationMinutes === d && styles.durationBtnSel]}
                  onPress={() => setForm((f) => ({ ...f, durationMinutes: d }))}
                >
                  <Text
                    style={[
                      styles.durationBtnText,
                      form.durationMinutes === d && styles.durationBtnTextSel,
                    ]}
                  >
                    {d < 60 ? `${d}m` : d === 60 ? "1h" : d === 90 ? "1.5h" : "2h"}
                  </Text>
                </Pressable>
              ))}
            </View>

            {tables.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>CHAIR (Optional)</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.pillScroll}
                  contentContainerStyle={styles.pillContent}
                >
                  <Pressable
                    style={[styles.pill, !form.chairId && styles.pillSel]}
                    onPress={() => setForm((f) => ({ ...f, chairId: undefined, chairName: "" }))}
                  >
                    <Text style={[styles.pillText, !form.chairId && styles.pillTextSel]}>None</Text>
                  </Pressable>
                  {tables.map((t) => (
                    <Pressable
                      key={t.id}
                      style={[styles.pill, form.chairId === t.id && styles.pillSel]}
                      onPress={() => setForm((f) => ({ ...f, chairId: t.id, chairName: t.name }))}
                    >
                      <Text
                        style={[styles.pillText, form.chairId === t.id && styles.pillTextSel]}
                      >
                        {t.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            <Text style={styles.sectionLabel}>NOTES</Text>
            <View style={styles.formCard}>
              <TextInput
                style={styles.notesInput}
                value={form.notes}
                onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))}
                placeholder="Special requests or notes…"
                placeholderTextColor="#555"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {editingAppt && (
              <Pressable
                style={styles.deleteBtn}
                onPress={() => handleDelete(editingAppt.id)}
              >
                <Feather name="trash-2" size={15} color="#E74C3C" />
                <Text style={styles.deleteBtnText}>Delete Appointment</Text>
              </Pressable>
            )}

            <View style={{ height: 48 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F1117" },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
    backgroundColor: "#1A1D25", borderBottomWidth: 1, borderBottomColor: "#252830",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#FFF" },
  badge: {
    backgroundColor: "#4F8EF7", borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, minWidth: 20, alignItems: "center",
  },
  badgeText: { fontSize: 11, fontWeight: "800", color: "#FFF" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  todayBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: "#2A2D35",
  },
  todayBtnText: { fontSize: 13, color: "#AAA", fontWeight: "600" },
  newBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#4F8EF7", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
  },
  newBtnText: { fontSize: 13, fontWeight: "700", color: "#FFF" },

  weekStrip: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 4, paddingVertical: 10, backgroundColor: "#1A1D25",
    borderBottomWidth: 1, borderBottomColor: "#252830",
  },
  weekArrow: { padding: 6 },
  dayPill: {
    flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: 10,
  },
  dayPillSel: { backgroundColor: "#4F8EF7" },
  dayAbbr: { fontSize: 11, color: "#666", fontWeight: "600", marginBottom: 2 },
  dayAbbrSel: { color: "#FFF" },
  dayNum: { fontSize: 15, fontWeight: "700", color: "#888" },
  dayNumSel: { color: "#FFF" },

  dayLabelRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 10,
  },
  dayLabel: { fontSize: 15, fontWeight: "700", color: "#FFF" },
  apptCount: { fontSize: 12, color: "#555" },

  list: { padding: 12, paddingBottom: 40 },

  card: {
    backgroundColor: "#1A1D25", borderRadius: 12, marginBottom: 10,
    borderLeftWidth: 4, borderWidth: 1, borderColor: "#252830",
  },
  cardInner: { flexDirection: "row", padding: 12 },
  timeCol: { alignItems: "center", width: 56, paddingRight: 8 },
  cardTime: { fontSize: 13, fontWeight: "700", color: "#FFF", textAlign: "center" },
  cardEndTime: { fontSize: 11, color: "#555", textAlign: "center", marginTop: 2 },
  durationTag: {
    marginTop: 6, backgroundColor: "#252830", borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  durationTagText: { fontSize: 10, color: "#666", fontWeight: "700" },
  cardDivider: { width: 1, backgroundColor: "#252830", marginHorizontal: 8 },
  cardBody: { flex: 1 },
  cardTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  cardCustomer: { fontSize: 16, fontWeight: "700", color: "#FFF", flex: 1, marginRight: 8 },
  statusPill: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, borderWidth: 1,
  },
  statusPillText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  cardMeta: { fontSize: 12, color: "#666", marginBottom: 2 },
  cardNotes: { fontSize: 12, color: "#555", marginTop: 4, fontStyle: "italic" },
  cardActions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: "600" },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: "#333" },
  emptySubtitle: { fontSize: 14, color: "#444", textAlign: "center", lineHeight: 20 },
  emptyNewBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#4F8EF7", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 8,
  },
  emptyNewBtnText: { fontSize: 14, fontWeight: "700", color: "#FFF" },

  modalWrapper: { flex: 1, backgroundColor: "#0F1117" },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    backgroundColor: "#1A1D25", borderBottomWidth: 1, borderBottomColor: "#252830",
  },
  modalCancelBtn: { minWidth: 60 },
  modalCancelText: { fontSize: 15, color: "#888" },
  modalTitle: { fontSize: 16, fontWeight: "700", color: "#FFF" },
  modalSaveBtn: { minWidth: 60, alignItems: "flex-end" },
  modalSaveText: { fontSize: 15, color: "#4F8EF7", fontWeight: "700" },
  modalScroll: { flex: 1 },
  modalContent: { padding: 16 },

  sectionLabel: {
    fontSize: 11, fontWeight: "700", color: "#555", letterSpacing: 0.8, marginBottom: 8, marginTop: 18,
  },
  formCard: {
    backgroundColor: "#1A1D25", borderRadius: 10,
    borderWidth: 1, borderColor: "#252830",
  },
  formRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10 },
  formLabel: { fontSize: 14, color: "#888", width: 70 },
  formInputRow: { flex: 1, flexDirection: "row", alignItems: "center" },
  formInput: { fontSize: 14, color: "#FFF", flex: 1 },
  searchIconBtn: { padding: 6 },

  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: "#252830",
  },
  searchInput: { flex: 1, fontSize: 14, color: "#FFF" },
  custResults: {},
  custRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: "#252830",
  },
  custName: { fontSize: 14, color: "#DDD", fontWeight: "600" },
  custPhone: { fontSize: 12, color: "#555", marginTop: 1 },
  noResults: { fontSize: 13, color: "#555", textAlign: "center", padding: 16 },

  pillScroll: { flexGrow: 0 },
  pillContent: { gap: 8, paddingHorizontal: 2, paddingVertical: 2 },
  pill: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: "#1A1D25", borderWidth: 1, borderColor: "#2A2D35",
  },
  pillSel: { backgroundColor: "#4F8EF722", borderColor: "#4F8EF7" },
  pillText: { fontSize: 13, color: "#666", fontWeight: "600" },
  pillTextSel: { color: "#4F8EF7" },

  serviceInput: {
    fontSize: 14, color: "#FFF", paddingHorizontal: 14, paddingVertical: 12,
  },

  weekStripCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#1A1D25", borderRadius: 10,
    borderWidth: 1, borderColor: "#252830", paddingVertical: 8, paddingHorizontal: 2,
  },
  dayPillSm: { flex: 1, alignItems: "center", paddingVertical: 4, borderRadius: 8 },
  dayPillSmSel: { backgroundColor: "#4F8EF7" },
  dayAbbrSm: { fontSize: 10, color: "#555", fontWeight: "600", marginBottom: 2 },
  dayAbbrSmSel: { color: "#FFF" },
  dayNumSm: { fontSize: 14, fontWeight: "700", color: "#777" },
  dayNumSmSel: { color: "#FFF" },

  timePill: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
    backgroundColor: "#1A1D25", borderWidth: 1, borderColor: "#2A2D35",
  },
  timePillSel: { backgroundColor: "#4F8EF722", borderColor: "#4F8EF7" },
  timePillText: { fontSize: 13, color: "#666", fontWeight: "600" },
  timePillTextSel: { color: "#4F8EF7" },

  durationRow: { flexDirection: "row", gap: 8 },
  durationBtn: {
    flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 8,
    backgroundColor: "#1A1D25", borderWidth: 1, borderColor: "#2A2D35",
  },
  durationBtnSel: { backgroundColor: "#4F8EF722", borderColor: "#4F8EF7" },
  durationBtnText: { fontSize: 13, color: "#666", fontWeight: "700" },
  durationBtnTextSel: { color: "#4F8EF7" },

  notesInput: {
    fontSize: 14, color: "#FFF", paddingHorizontal: 14, paddingVertical: 12,
    minHeight: 80,
  },

  deleteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginTop: 24, paddingVertical: 12, borderRadius: 10,
    backgroundColor: "#E74C3C18", borderWidth: 1, borderColor: "#E74C3C44",
  },
  deleteBtnText: { fontSize: 14, color: "#E74C3C", fontWeight: "600" },
});
