import {
  Phone, PhoneCall, PhoneMissed, User, Building2, Hash, Mail, Globe,
  Linkedin, X, ThumbsDown, CalendarCheck, AlertTriangle, Ban,
  RotateCcw, Star, SkipForward,
} from "lucide-react";
import type { ContactStatus, SystemFieldKey } from "@/types";
import { LucideIcon } from "lucide-react";

export interface StatusDef {
  label: string;
  color: string;
  bg: string;
  icon: LucideIcon;
  key?: string;
}

export const STATUS_CONFIG: Record<ContactStatus, StatusDef> = {
  ej_ringd:     { label: "Ej ringd",     color: "#8b8492", bg: "rgba(139,132,146,0.1)",  icon: Phone },
  svarar_ej:    { label: "Svarar ej",    color: "#f59e0b", bg: "rgba(245,158,11,0.1)",   icon: PhoneMissed,   key: "1" },
  nej_tack:     { label: "Nej tack",     color: "#ef4444", bg: "rgba(239,68,68,0.1)",    icon: ThumbsDown,    key: "2" },
  bokat_mote:   { label: "Bokat möte",   color: "#22c55e", bg: "rgba(34,197,94,0.1)",    icon: CalendarCheck, key: "3" },
  upptaget:     { label: "Upptaget",     color: "#fb923c", bg: "rgba(251,146,60,0.1)",   icon: AlertTriangle, key: "4" },
  fel_nummer:   { label: "Fel nummer",   color: "#f87171", bg: "rgba(248,113,113,0.1)",  icon: Ban,           key: "5" },
  atersam:      { label: "Återsamtal",   color: "#3b82f6", bg: "rgba(59,130,246,0.1)",   icon: RotateCcw,     key: "6" },
  intresserad:  { label: "Intresserad",  color: "#a78bfa", bg: "rgba(167,139,250,0.1)",  icon: Star,          key: "7" },
  klar:         { label: "Klar",         color: "#22c55e", bg: "rgba(34,197,94,0.1)",    icon: CalendarCheck },
  hoppat_over:  { label: "Hoppat över",  color: "#6b7280", bg: "rgba(107,114,128,0.1)",  icon: SkipForward },
};

export interface SystemFieldDef {
  key: SystemFieldKey;
  label: string;
  icon: LucideIcon;
  required?: boolean;
}

export const SYSTEM_FIELDS: SystemFieldDef[] = [
  { key: "name",         label: "Namn",           icon: User,     required: true },
  { key: "company",      label: "Företag",         icon: Building2, required: true },
  { key: "role",         label: "Roll / Titel",    icon: Hash },
  { key: "direct_phone", label: "Direktnummer",    icon: Phone,    required: true },
  { key: "switchboard",  label: "Växelnummer",     icon: PhoneCall },
  { key: "email",        label: "E-post",          icon: Mail },
  { key: "website",      label: "Hemsida (URL)",   icon: Globe },
  { key: "linkedin",     label: "LinkedIn (URL)",  icon: Linkedin },
  { key: "org_number",   label: "Org.nummer",      icon: Hash },
  { key: "skip",         label: "— Hoppa över —",  icon: X },
];

export const SHORTCUTS = [
  { key: "1", label: "Svarar ej" }, { key: "2", label: "Nej tack" },
  { key: "3", label: "Bokat möte" }, { key: "4", label: "Upptaget" },
  { key: "5", label: "Fel nummer" }, { key: "6", label: "Återsamtal" },
  { key: "7", label: "Intresserad" }, { key: "␣", label: "Ring direkt" },
  { key: "D", label: "Ring direkt" }, { key: "V", label: "Ring växel" },
  { key: "N", label: "Nästa lead" }, { key: "P", label: "Föregående" },
  { key: "?", label: "Visa shortcuts" },
];

export const DEMO_CONTACTS = [
  { id:"demo-001", name:"Elin Holward Bede", company:"Neonic IT AB", role:"VD", direct_phone:"+46701469466", switchboard:"", email:"elin.holward.bede@neonic.se", website:"https://neonic.se", linkedin:"", org_number:"5593892127", status:"ej_ringd" as ContactStatus, notes:"", tags:[], lastContact:null },
  { id:"demo-002", name:"David Bryngelsson", company:"CarbonCloud AB", role:"Sales Manager", direct_phone:"+46731234567", switchboard:"+46317654321", email:"david@carboncloud.com", website:"https://carboncloud.com", linkedin:"https://linkedin.com/in/david-bryngelsson", org_number:"5591234567", status:"ej_ringd" as ContactStatus, notes:"", tags:[], lastContact:null },
  { id:"demo-003", name:"Björn Jacobsson", company:"Medrave Software AB", role:"CTO", direct_phone:"+46709876543", switchboard:"", email:"bjorn@medrave.com", website:"https://medrave.com", linkedin:"", org_number:"5569876543", status:"ej_ringd" as ContactStatus, notes:"", tags:[], lastContact:null },
  { id:"demo-004", name:"Karl Hägg", company:"Niam Project Dev AB", role:"Projektledare", direct_phone:"+46761111222", switchboard:"+46812345678", email:"karl@niam.se", website:"https://niam.se", linkedin:"https://linkedin.com/in/karl-hagg", org_number:"5561112233", status:"ej_ringd" as ContactStatus, notes:"", tags:[], lastContact:null },
  { id:"demo-005", name:"Linda Strömberg", company:"Saeubjona IT AB", role:"CEO", direct_phone:"+46702223344", switchboard:"", email:"linda@saeubjona.se", website:"https://saeubjona.se", linkedin:"", org_number:"5562223344", status:"ej_ringd" as ContactStatus, notes:"", tags:[], lastContact:null },
  { id:"demo-006", name:"Sara Bälter", company:"S4u IT Consulting AB", role:"Account Manager", direct_phone:"+46733334455", switchboard:"+46854321098", email:"sara@s4u.se", website:"https://s4u.se", linkedin:"https://linkedin.com/in/sara-balter", org_number:"5563334455", status:"ej_ringd" as ContactStatus, notes:"", tags:[], lastContact:null },
  { id:"demo-007", name:"Emil Grönvall", company:"byBrick Development AB", role:"Upphandlare", direct_phone:"+46704445566", switchboard:"", email:"emil@bybrick.se", website:"https://bybrick.se", linkedin:"", org_number:"5564445566", status:"ej_ringd" as ContactStatus, notes:"", tags:[], lastContact:null },
  { id:"demo-008", name:"Mirza Muhic", company:"Prog-it AB", role:"VD", direct_phone:"+46765556677", switchboard:"+46876543210", email:"mirza@prog-it.se", website:"https://prog-it.se", linkedin:"https://linkedin.com/in/mirza-muhic", org_number:"5565556677", status:"ej_ringd" as ContactStatus, notes:"", tags:[], lastContact:null },
];
