import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { EmailAuthProvider, reauthenticateWithCredential, signOut, updatePassword } from "firebase/auth";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { auth } from "../firebase.js";
import { authFetch } from "../apiClient.js";
import { AIRPORT_OPTIONS } from "../data/airports.js";

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function fmt(n) { return Number(n||0).toLocaleString("en-IN"); }
function calcTotal(f) { return (Number(f.baseFare)||0)+(Number(f.taxes)||0)+(Number(f.agencyFee)||0); }
function today() { return new Date().toISOString().split("T")[0]; }
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

/** Parse "DEL - Delhi" or typed "DEL" / "del" into 3-letter IATA for DB. */
function airportFieldToIata(val) {
  if (!val || !String(val).trim()) return "";
  const s = String(val).trim();
  const withDash = s.match(/^([A-Za-z]{3})\s*[-–—]/);
  if (withDash) return withDash[1].toUpperCase();
  const only3 = s.match(/^([A-Za-z]{3})$/);
  if (only3) return only3[1].toUpperCase();
  const letters = s.replace(/[^A-Za-z]/g, "");
  return letters.slice(0, 3).toUpperCase();
}

function normalizeBooking(booking) {
  if (!booking) return booking;
  const id = booking._id || booking.id;
  const rawPid = booking.partyId;
  const partyId =
    rawPid != null && String(rawPid).trim() !== "" ? String(rawPid).trim() : "";
  return { ...booking, id, _id: booking._id || id, partyId };
}

function toServerBooking(booking) {
  const { id, _id, ownerUid, ...payload } = booking;
  return payload;
}

function normalizeParty(party) {
  if (!party) return party;
  return { ...party, id: party.id || party._id };
}

function normalizeLedger(entry) {
  if (!entry) return entry;
  return { ...entry, id: entry.id || entry._id };
}

const SEED_PARTIES = [
 
];
 
const SEED_BOOKINGS = [
 
];
 
const SEED_LEDGER = [
  
];

const AIRLINES = ["IndiGo","Air India","SpiceJet","Vistara","GoFirst","AirAsia India","Akasa Air","Emirates","Qatar Airways","Singapore Airlines","Lufthansa","British Airways"];
const STATUS_COLORS = { confirmed:"#22c55e", cancelled:"#ef4444", refunded:"#f59e0b", pending:"#3b82f6" };
const TAG_COLORS    = { business:"#6366f1", leisure:"#ec4899", group:"#f97316", urgent:"#ef4444" };
const PARTY_TYPES   = ["agent","individual"];
const PAYMENT_MODES = ["Cash","IMPS","NEFT","UPI","Cheque","Card"];
const EMPTY_BOOKING = { pnr:"", passengerName:"", phone:"", email:"", airline:"", flightNo:"", from:"", to:"", travelDate:"", departure:"", arrival:"", bookingDate:today(), baseFare:"", taxes:"", agencyFee:"", currency:"INR", status:"confirmed", partyId:"", tags:[], notes:"" };
const EMPTY_PARTY   = { name:"", type:"agent", phone:"", email:"", city:"", gstin:"", creditLimit:"", notes:"" };
const EMPTY_PAYMENT = { date:today(), partyId:"", type:"receipt", description:"", amount:"", mode:"Cash", notes:"", senderAccount:"", receiverAccount:"", referenceNo:"", transactionTime:"" };

// ── CSS ────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Outfit:wght@300;400;500;600;700;800&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#0d1117;--surface:#161b22;--surface2:#21262d;--border:#30363d;
  --text:#e6edf3;--muted:#7d8590;--accent:#2ea043;--accent2:#1f6feb;
  --danger:#f85149;--warn:#d29922;--info:#58a6ff;--purple:#a371f7;
  --font:'Outfit',sans-serif;--mono:'DM Mono',monospace;
}
body{background:var(--bg);color:var(--text);font-family:var(--font);min-height:100vh;}

.nav{background:var(--surface);border-bottom:1px solid var(--border);padding:0 20px;display:flex;align-items:center;position:sticky;top:0;z-index:100;flex-wrap:wrap;gap:0;}
.nav-brand{font-size:15px;font-weight:700;padding:14px 0;margin-right:16px;display:flex;align-items:center;gap:6px;}
.nav-brand span{color:var(--accent);}
.nav-btn{background:none;border:none;color:var(--muted);font-family:var(--font);font-size:13px;font-weight:500;padding:14px 10px;cursor:pointer;border-bottom:2px solid transparent;transition:all .15s;}
.nav-btn:hover{color:var(--text);}
.nav-btn.active{color:var(--text);border-bottom-color:var(--accent);}
.nav-spacer{flex:1;}
.nav-add{background:var(--accent);color:#fff;border:none;border-radius:6px;padding:7px 14px;font-family:var(--font);font-size:13px;font-weight:600;cursor:pointer;}
.nav-add:hover{opacity:.9;}
.profile-wrap{position:relative;display:flex;align-items:center;}
.profile-btn{background:none;border:1px solid var(--border);border-radius:999px;width:34px;height:34px;padding:0;display:grid;place-items:center;cursor:pointer;transition:all .15s;color:var(--text);overflow:hidden;}
.profile-btn:hover{border-color:var(--info);background:var(--surface2);}
.profile-avatar{width:100%;height:100%;object-fit:cover;}
.profile-fallback{font-family:var(--mono);font-size:12px;color:var(--muted);}
.profile-menu{position:absolute;right:0;top:44px;min-width:220px;background:var(--surface);border:1px solid var(--border);border-radius:10px;box-shadow:0 16px 50px rgba(0,0,0,.55);padding:10px;z-index:200;}
.profile-head{padding:10px 10px 8px;border-bottom:1px solid var(--border);margin-bottom:6px;}
.profile-name{font-size:13px;font-weight:700;}
.profile-sub{font-size:11px;color:var(--muted);margin-top:2px;font-family:var(--mono);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.profile-item{width:100%;text-align:left;background:none;border:1px solid transparent;border-radius:8px;padding:9px 10px;color:var(--text);cursor:pointer;font-family:var(--font);font-size:13px;font-weight:600;display:flex;gap:10px;align-items:center;transition:all .12s;}
.profile-item:hover{background:var(--surface2);border-color:var(--border);}
.profile-item.danger{color:var(--danger);}
.profile-item.danger:hover{background:rgba(248,81,73,.10);border-color:rgba(248,81,73,.25);}
.profile-file{display:none;}
.pw-grid{display:grid;grid-template-columns:1fr;gap:10px;margin-top:12px;}
.pw-hint{font-size:11px;color:var(--muted);font-family:var(--mono);margin-top:8px;line-height:1.4;}

.main{padding:24px 20px;width:100%;margin:0 auto;}

.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:28px;}
.stat-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px 18px;}
.stat-label{font-size:11px;color:var(--muted);letter-spacing:.5px;text-transform:uppercase;margin-bottom:6px;font-family:var(--mono);}
.stat-value{font-size:24px;font-weight:700;line-height:1;}
.stat-sub{font-size:11px;color:var(--muted);margin-top:4px;}
.stat-card.green .stat-value{color:var(--accent);}
.stat-card.blue  .stat-value{color:var(--info);}
.stat-card.red   .stat-value{color:var(--danger);}
.stat-card.warn  .stat-value{color:var(--warn);}
.stat-card.purple .stat-value{color:var(--purple);}

.section-title{font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;font-family:var(--mono);}

.booking-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:10px;cursor:pointer;transition:border-color .15s,background .15s;}
.booking-card:hover{border-color:var(--info);background:var(--surface2);}
.bc-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px;}
.bc-name{font-size:15px;font-weight:600;}
.bc-pnr{font-family:var(--mono);font-size:11px;color:var(--muted);margin-top:2px;}
.bc-total{font-size:16px;font-weight:700;color:var(--accent);white-space:nowrap;}
.bc-route{display:flex;align-items:center;gap:10px;}
.bc-iata{font-family:var(--mono);font-size:16px;font-weight:600;}
.bc-arrow{color:var(--muted);font-size:18px;}
.bc-airline{font-size:12px;color:var(--muted);}
.bc-meta{display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap;}
.badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:500;}
.badge-tag{font-size:10px;border:1px solid;border-radius:3px;}
.bc-date{font-size:11px;color:var(--muted);font-family:var(--mono);}
.bc-party{font-size:11px;color:var(--purple);font-family:var(--mono);}

.party-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:10px;cursor:pointer;transition:border-color .15s,background .15s;}
.party-card:hover{border-color:var(--purple);background:var(--surface2);}
.pc-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;}
.pc-name{font-size:15px;font-weight:600;}
.pc-type{font-size:10px;padding:2px 8px;border-radius:3px;border:1px solid;text-transform:uppercase;letter-spacing:.5px;}
.pc-balance{font-size:16px;font-weight:700;}
.pc-balance.get{color:var(--accent);}
.pc-balance.give{color:var(--danger);}
.pc-balance.zero{color:var(--muted);}
.pc-meta{display:flex;gap:12px;flex-wrap:wrap;}
.pc-meta span{font-size:11px;color:var(--muted);font-family:var(--mono);}

.ledger-table{width:100%;border-collapse:collapse;font-size:13px;}
.ledger-table th{font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);}
.ledger-table td{padding:10px;border-bottom:1px solid var(--border);vertical-align:top;}
.ledger-table tr:last-child td{border-bottom:none;}
.ledger-table tr:hover td{background:var(--surface2);}
.lt-inv{color:var(--danger);}
.lt-rec{color:var(--accent);}
.lt-desc{font-size:12px;color:var(--muted);margin-top:2px;font-family:var(--mono);}
.balance-cell{font-family:var(--mono);font-weight:600;}
.lt-edit-btn{background:none;border:1px solid var(--border);border-radius:4px;padding:2px 8px;font-size:11px;color:var(--info);cursor:pointer;font-family:var(--mono);transition:all .15s;}
.lt-edit-btn:hover{background:var(--surface2);border-color:var(--info);}
.lt-ledger-actions{display:flex;align-items:center;gap:6px;flex-wrap:nowrap;}
.lt-del-btn{background:none;border:1px solid var(--border);border-radius:4px;padding:2px 8px;font-size:11px;color:var(--danger);cursor:pointer;font-family:var(--mono);transition:all .15s;}
.lt-del-btn:hover{background:rgba(248,81,73,.12);border-color:var(--danger);}

.search-row{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;}
.search-input{flex:1;min-width:180px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:9px 14px;color:var(--text);font-family:var(--font);font-size:13px;outline:none;}
.search-input:focus{border-color:var(--info);}
.filter-sel{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:9px 10px;color:var(--text);font-family:var(--font);font-size:13px;outline:none;cursor:pointer;}
.filter-sel:focus{border-color:var(--info);}

.form-wrap{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:24px;}
.form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;}
.fg{display:flex;flex-direction:column;gap:5px;}
.fg.full{grid-column:1/-1;}
.flabel{font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;font-family:var(--mono);}
.flabel .req{color:var(--danger);}
.finput{background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:9px 12px;color:var(--text);font-family:var(--font);font-size:14px;outline:none;transition:border-color .15s;width:100%;}
.finput:focus{border-color:var(--info);}
.finput.err{border-color:var(--danger);}
.finput::placeholder{color:var(--muted);}
.errmsg{font-size:11px;color:var(--danger);font-family:var(--mono);}
.airport-hint{font-size:10px;color:var(--muted);font-family:var(--mono);margin-top:4px;line-height:1.3;}

.ticket-drop{border:1.5px dashed var(--border);border-radius:8px;padding:20px;text-align:center;cursor:pointer;transition:all .2s;margin-bottom:20px;position:relative;overflow:hidden;}
.ticket-drop:hover,.ticket-drop.over{border-color:var(--info);background:rgba(31,111,235,.05);}
.ticket-drop input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;}
.ticket-drop-title{font-size:13px;font-weight:600;margin-bottom:4px;}
.ticket-drop-sub{font-size:11px;color:var(--muted);}

.total-box{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:14px;}
.total-row{display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-bottom:4px;font-family:var(--mono);}
.total-final{display:flex;justify-content:space-between;font-size:15px;font-weight:700;color:var(--accent);padding-top:8px;border-top:1px solid var(--border);margin-top:4px;}

.tag-row{display:flex;gap:6px;flex-wrap:wrap;}
.tag-btn{padding:4px 10px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid;transition:all .15s;font-family:var(--font);}

.btn{padding:10px 20px;border-radius:8px;font-family:var(--font);font-size:13px;font-weight:600;cursor:pointer;border:none;transition:all .15s;display:inline-flex;align-items:center;gap:6px;}
.btn-primary{background:var(--accent);color:#fff;}
.btn-primary:hover{opacity:.9;}
.btn-purple{background:var(--purple);color:#fff;}
.btn-purple:hover{opacity:.9;}
.btn-info{background:var(--info);color:#fff;}
.btn-info:hover{opacity:.9;}
.btn-ghost{background:var(--surface2);color:var(--text);border:1px solid var(--border);}
.btn-ghost:hover{border-color:var(--info);}
.btn-danger{background:rgba(248,81,73,.12);color:var(--danger);border:1px solid rgba(248,81,73,.3);}
.btn-danger:hover{background:rgba(248,81,73,.22);}
.btn-sm{padding:6px 12px;font-size:12px;}
.btn-row{display:flex;gap:10px;margin-top:24px;flex-wrap:wrap;}

.detail-route{display:flex;align-items:center;gap:16px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:16px;}
.d-iata{text-align:center;}
.d-code{font-family:var(--mono);font-size:32px;font-weight:700;}
.d-time{font-size:12px;color:var(--muted);margin-top:2px;}
.d-line{flex:1;height:1px;background:var(--border);position:relative;}
.d-line::after{content:'✈';position:absolute;top:-9px;left:50%;transform:translateX(-50%);font-size:14px;color:var(--muted);}
.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;}
.d-field{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 14px;}
.d-field-label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;font-family:var(--mono);margin-bottom:4px;}
.d-field-value{font-size:14px;font-weight:500;}

.balance-banner{border-radius:10px;padding:16px 20px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;}
.balance-banner.get{background:rgba(46,160,67,.1);border:1px solid rgba(46,160,67,.3);}
.balance-banner.give{background:rgba(248,81,73,.1);border:1px solid rgba(248,81,73,.3);}
.balance-banner.zero{background:var(--surface);border:1px solid var(--border);}
.bb-label{font-size:12px;color:var(--muted);font-family:var(--mono);}
.bb-amount{font-size:28px;font-weight:800;}
.bb-amount.get{color:var(--accent);}
.bb-amount.give{color:var(--danger);}

.tabs{display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:16px;flex-wrap:wrap;}
.tab-btn{background:none;border:none;border-bottom:2px solid transparent;padding:10px 16px;font-family:var(--font);font-size:13px;font-weight:500;color:var(--muted);cursor:pointer;margin-bottom:-1px;}
.tab-btn.active{color:var(--text);border-bottom-color:var(--purple);}
.tab-btn:hover{color:var(--text);}

.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 18px;font-size:13px;display:flex;align-items:center;gap:10px;z-index:999;box-shadow:0 8px 32px rgba(0,0,0,.5);white-space:nowrap;}
.toast.success{border-color:var(--accent);color:var(--accent);}
.toast.error{border-color:var(--danger);color:var(--danger);}
.toast.warn{border-color:var(--warn);color:var(--warn);}
.toast.info{border-color:var(--info);color:var(--info);}
.undo-btn{background:none;border:1px solid currentColor;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;color:inherit;font-family:var(--mono);}

.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;}
.modal{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:24px;max-width:560px;width:100%;max-height:90vh;overflow-y:auto;}
.modal-title{font-size:16px;font-weight:700;margin-bottom:8px;}
.modal-text{font-size:13px;color:var(--muted);margin-bottom:20px;}
.modal-btns{display:flex;gap:10px;justify-content:flex-end;}

.empty{text-align:center;padding:60px 20px;color:var(--muted);}
.empty-icon{font-size:40px;margin-bottom:12px;}
.empty-text{font-size:14px;}

.page-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px;}
.page-title{font-size:20px;font-weight:700;}
.page-sub{font-size:13px;color:var(--muted);margin-top:2px;}

.two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px;}

/* Chart styles */
.chart-container{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:20px;min-width:0;overflow:hidden;}
.chart-title{font-size:14px;font-weight:600;margin-bottom:16px;display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;row-gap:8px;}
.chart-period-btns{display:flex;gap:4px;flex-wrap:wrap;}
.period-btn{padding:4px 10px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--muted);font-family:var(--mono);transition:all .15s;}
.period-btn.active{background:var(--surface2);color:var(--text);border-color:var(--info);}
.bar-chart{display:grid;align-items:end;gap:4px;height:150px;width:100%;min-width:0;padding-bottom:0;box-sizing:border-box;}
.bar-wrap{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;min-width:0;width:100%;gap:3px;}
.bar{border-radius:4px 4px 0 0;width:100%;max-width:100%;transition:height .3s;min-height:2px;cursor:pointer;position:relative;}
.bar:hover{opacity:.8;}
.bar-label{font-size:8px;color:var(--muted);font-family:var(--mono);text-align:center;width:100%;min-width:0;line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.bar-val{font-size:8px;color:var(--muted);font-family:var(--mono);width:100%;min-width:0;text-align:center;line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

/* Pie chart */
.pie-row{display:flex;align-items:center;gap:20px;flex-wrap:wrap;}
.pie-legend{display:flex;flex-direction:column;gap:8px;flex:1;min-width:140px;}
.pie-legend-item{display:flex;align-items:center;gap:8px;font-size:12px;}
.pie-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;}

/* Explore buttons */
.explore-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:20px 0;}
.explore-btn{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;cursor:pointer;transition:all .2s;text-align:left;}
.explore-btn:hover{border-color:var(--info);background:var(--surface2);}
.explore-btn.booking:hover{border-color:var(--accent);}
.explore-btn.party:hover{border-color:var(--purple);}
.explore-icon{font-size:28px;margin-bottom:8px;}
.explore-title{font-size:15px;font-weight:700;margin-bottom:4px;}
.explore-sub{font-size:12px;color:var(--muted);}

/* Report section */
.report-section{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:20px;}
.report-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px;}
.report-title{font-size:15px;font-weight:600;}
.date-range-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:16px;}
.date-range-row label{font-size:11px;color:var(--muted);font-family:var(--mono);}

/* Payment scanner */
.scanner-drop{border:1.5px dashed var(--border);border-radius:8px;padding:16px;text-align:center;cursor:pointer;transition:all .2s;position:relative;overflow:hidden;margin-bottom:16px;}
.scanner-drop:hover,.scanner-drop.over{border-color:var(--purple);background:rgba(163,113,247,.05);}
.scanner-drop input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;}
.scanner-drop-title{font-size:13px;font-weight:600;margin-bottom:4px;}
.scanner-drop-sub{font-size:11px;color:var(--muted);}

/* Ledger inline edit */
.ledger-edit-form{background:var(--surface2);border:1px solid var(--info);border-radius:8px;padding:14px;margin:4px 0;}
.ledger-edit-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;}

@media(max-width:600px){
  .main{padding:16px 12px;}
  .detail-grid,.two-col,.explore-row{grid-template-columns:1fr;}
  .form-grid{grid-template-columns:1fr;}
  .nav-btn{padding:14px 8px;font-size:12px;}
  .ledger-table{font-size:11px;}
  .ledger-table th,.ledger-table td{padding:7px 6px;}
  .bar-chart{height:140px;gap:2px;}
  .bar-label,.bar-val{font-size:7px;}
  .chart-container{padding:14px 12px;}
  .chart-title{font-size:13px;}
  .period-btn{padding:4px 8px;font-size:10px;}
}
`;

// ── Helpers ────────────────────────────────────────────────────────────────
function partyBalance(partyId, ledger) {
  let bal = 0;
  ledger.filter(e => e.partyId === partyId).forEach(e => {
    if (e.type === "invoice") bal += Number(e.amount) || 0;
    else if (e.type === "receipt") bal -= Number(e.amount) || 0;
  });
  return bal;
}

function partyLedgerEntries(partyId, ledger) {
  const entries = ledger.filter(e => e.partyId === partyId)
    .sort((a, b) => a.date.localeCompare(b.date));
  let running = 0;
  return entries.map(e => {
    if (e.type === "invoice") running += Number(e.amount) || 0;
    else running -= Number(e.amount) || 0;
    return { ...e, running };
  });
}

function getWeekLabel(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d.setDate(diff));
  return mon.toISOString().split("T")[0];
}

function filterByPeriod(items, period, dateField, customStart, customEnd) {
  const now = new Date();
  return items.filter(item => {
    const d = new Date(item[dateField]);
    if (!d) return false;
    if (period === "week") {
      const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
      return d >= weekAgo;
    } else if (period === "month") {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    } else if (period === "year") {
      return d.getFullYear() === now.getFullYear();
    } else if (period === "custom" && customStart && customEnd) {
      return d >= new Date(customStart) && d <= new Date(customEnd + "T23:59:59");
    }
    return true;
  });
}

// ── Simple Bar Chart ────────────────────────────────────────────────────────
function BarChart({ data, color = "#2ea043", label = "" }) {
  const max = Math.max(...data.map(d => d.value), 1);
  const cols = Math.max(data.length, 1);
  return (
    <div
      className="bar-chart"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {data.map((d, i) => (
        <div key={i} className="bar-wrap">
          <div className="bar-val">{d.value > 0 ? fmt(d.value) : ""}</div>
          <div
            className="bar"
            style={{
              height: `${Math.max((d.value / max) * 110, d.value > 0 ? 4 : 0)}px`,
              background: color,
              opacity: 0.7 + 0.3 * (d.value / max)
            }}
            title={`${d.label}: ${d.value}`}
          />
          <div className="bar-label">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Simple Pie Chart (SVG) ──────────────────────────────────────────────────
function PieChart({ slices, size = 110 }) {
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  if (!total) return <div style={{ color: "var(--muted)", fontSize: 12 }}>No data</div>;
  let cumAngle = 0;
  const r = size / 2 - 6;
  const cx = size / 2, cy = size / 2;
  const paths = slices.map(sl => {
    const angle = (sl.value / total) * 2 * Math.PI;
    const x1 = cx + r * Math.sin(cumAngle);
    const y1 = cy - r * Math.cos(cumAngle);
    cumAngle += angle;
    const x2 = cx + r * Math.sin(cumAngle);
    const y2 = cy - r * Math.cos(cumAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    return { d: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} Z`, color: sl.color, label: sl.label, value: sl.value, pct: Math.round((sl.value / total) * 100) };
  });
  return (
    <div className="pie-row">
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        {paths.map((p, i) => <path key={i} d={p.d} fill={p.color} opacity={0.85} />)}
        <circle cx={cx} cy={cy} r={r * 0.55} fill="var(--surface)" />
      </svg>
      <div className="pie-legend">
        {paths.map((p, i) => (
          <div key={i} className="pie-legend-item">
            <div className="pie-dot" style={{ background: p.color }} />
            <span style={{ color: "var(--muted)" }}>{p.label}</span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11 }}>{p.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Chart Section with period selector ─────────────────────────────────────
function ChartSection({ title, children, periods = ["week","month","year","custom"], defaultPeriod = "month", onPeriodChange, customStart, customEnd, setCustomStart, setCustomEnd }) {
  const [period, setPeriod] = useState(defaultPeriod);
  const handlePeriod = (p) => { setPeriod(p); if (onPeriodChange) onPeriodChange(p); };
  return (
    <div className="chart-container">
      <div className="chart-title">
        <span>{title}</span>
        <div className="chart-period-btns">
          {periods.map(p => (
            <button key={p} className={`period-btn${period === p ? " active" : ""}`} onClick={() => handlePeriod(p)}>
              {p === "custom" ? "Custom" : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {period === "custom" && (
        <div className="date-range-row" style={{ marginBottom: 12 }}>
          <label>From</label>
          <input type="date" className="finput" style={{ width: "auto" }} value={customStart} onChange={e => setCustomStart && setCustomStart(e.target.value)} />
          <label>To</label>
          <input type="date" className="finput" style={{ width: "auto" }} value={customEnd} onChange={e => setCustomEnd && setCustomEnd(e.target.value)} />
        </div>
      )}
      {children(period)}
    </div>
  );
}

// ── BOOKING CARD ─────────────────────────────────────────────────────────────
function BookingCard({ b, parties, onClick }) {
  const party = parties.find(p => p.id === b.partyId);
  return (
    <div className="booking-card" onClick={() => onClick(b)}>
      <div className="bc-top">
        <div>
          <div className="bc-name">{b.passengerName}</div>
          <div className="bc-pnr">{b.pnr} · {b.flightNo}</div>
        </div>
        <div className="bc-total">₹{fmt(b.total)}</div>
      </div>
      <div className="bc-route">
        <span className="bc-iata">{b.from}</span>
        <span className="bc-arrow">→</span>
        <span className="bc-iata">{b.to}</span>
        <span className="bc-airline">{b.airline}</span>
      </div>
      <div className="bc-meta">
        <span className="badge" style={{ background: STATUS_COLORS[b.status] || "#888", color: "#fff" }}>{b.status}</span>
        <span className="bc-date">✈ {b.travelDate}</span>
        {party && <span className="bc-party">👤 {party.name}</span>}
        {(b.tags || []).map(t => (
          <span key={t} className="badge badge-tag" style={{ color: TAG_COLORS[t], borderColor: TAG_COLORS[t] }}>{t}</span>
        ))}
      </div>
    </div>
  );
}

// ── PARTY CARD ─────────────────────────────────────────────────────────────
function PartyCard({ party, ledger, bookings, onClick }) {
  const bal = partyBalance(party.id, ledger);
  const bookingCount = bookings.filter(b => b.partyId === party.id).length;
  const balClass = bal > 0 ? "get" : bal < 0 ? "give" : "zero";
  const balLabel = bal > 0 ? "You'll Get" : bal < 0 ? "You'll Give" : "Settled";
  return (
    <div className="party-card" onClick={() => onClick(party)}>
      <div className="pc-top">
        <div>
          <div className="pc-name">{party.name}</div>
          <div style={{ marginTop: 4 }}>
            <span className="pc-type" style={{ color: "var(--purple)", borderColor: "rgba(163,113,247,.4)" }}>{party.type}</span>
            {party.city && <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 8, fontFamily: "var(--mono)" }}>{party.city}</span>}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className={`pc-balance ${balClass}`}>₹{fmt(Math.abs(bal))}</div>
          <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)", marginTop: 2 }}>{balLabel}</div>
        </div>
      </div>
      <div className="pc-meta">
        {party.phone && <span>📞 {party.phone}</span>}
        <span>📋 {bookingCount} booking{bookingCount !== 1 ? "s" : ""}</span>
      </div>
    </div>
  );
}

// ── DASHBOARD ──────────────────────────────────────────────────────────────
function Dashboard({ bookings, parties, ledger, stats, onCardClick, onViewAll, onViewAllParties, onNew, onViewParty, onExploreBookings, onExploreParties }) {
  const [customStart, setCustomStart] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0]; });
  const [customEnd, setCustomEnd] = useState(today);
  const totalReceivable = parties.reduce((s, p) => { const b = partyBalance(p.id, ledger); return s + (b > 0 ? b : 0); }, 0);
  const totalPayable = parties.reduce((s, p) => { const b = partyBalance(p.id, ledger); return s + (b < 0 ? Math.abs(b) : 0); }, 0);
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12)  return "Good Morning ☀️";
    if (hour >= 12 && hour < 17) return "Good Afternoon 🌤️";
    if (hour >= 17 && hour < 21) return "Good Evening 🌆";
    return "Good Night 🌙";
  };
  const getBookingChartData = (period) => {
    const filtered = filterByPeriod(bookings, period, "bookingDate", customStart, customEnd);
    const labels = [];
    const grouped = {};
    if (period === "week") {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const key = d.toISOString().split("T")[0];
        const lbl = d.toLocaleDateString("en-IN", { weekday: "short" });
        labels.push({ key, lbl });
      }
    } else if (period === "month") {
      const now = new Date();
      const days = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
      for (let i = 1; i <= days; i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), i);
        const key = d.toISOString().split("T")[0];
        labels.push({ key, lbl: String(i) });
      }
    } else if (period === "year") {
      for (let m = 0; m < 12; m++) {
        const d = new Date(new Date().getFullYear(), m, 1);
        const key = `${d.getFullYear()}-${String(m+1).padStart(2,"0")}`;
        const lbl = d.toLocaleDateString("en-IN", { month: "short" });
        labels.push({ key, lbl });
      }
    } else {
      const start = customStart ? new Date(customStart) : new Date();
      const end = customEnd ? new Date(customEnd) : new Date();
      const diff = Math.ceil((end - start) / (1000*60*60*24));
      const step = Math.max(1, Math.floor(diff / 10));
      for (let i = 0; i <= diff; i += step) {
        const d = new Date(start); d.setDate(start.getDate() + i);
        const key = d.toISOString().split("T")[0];
        const lbl = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
        labels.push({ key, lbl });
      }
    }
    filtered.forEach(b => {
      const dateKey = period === "year" ? b.bookingDate.slice(0,7) : period === "week" || period === "month" || period === "custom" ? b.bookingDate : b.bookingDate;
      if (grouped[dateKey] === undefined) grouped[dateKey] = 0;
      grouped[dateKey] += Number(b.total) || 0;
    });
    return labels.map(({ key, lbl }) => ({ label: lbl, value: grouped[key] || 0 }));
  };

  const getPartyChartData = (period) => {
    const filtered = filterByPeriod(ledger, period, "date", customStart, customEnd);
    const topParties = [...parties].map(p => {
      const total = filtered.filter(e => e.partyId === p.id && e.type === "invoice").reduce((s, e) => s + (Number(e.amount)||0), 0);
      return { name: p.name.slice(0, 12), value: total };
    }).sort((a, b) => b.value - a.value).slice(0, 8);
    return topParties;
  };

  const statusPie = [
    { label: "Confirmed", value: bookings.filter(b => b.status === "confirmed").length, color: "#22c55e" },
    { label: "Cancelled", value: bookings.filter(b => b.status === "cancelled").length, color: "#ef4444" },
    { label: "Pending", value: bookings.filter(b => b.status === "pending").length, color: "#3b82f6" },
    { label: "Refunded", value: bookings.filter(b => b.status === "refunded").length, color: "#f59e0b" },
  ].filter(s => s.value > 0);

  const tagPie = Object.entries(
    bookings.flatMap(b => b.tags || []).reduce((acc, t) => { acc[t] = (acc[t]||0)+1; return acc; }, {})
  ).map(([label, value], i) => ({ label, value, color: Object.values(TAG_COLORS)[i % 4] }));

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{getGreeting()}</div>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>{new Date().toDateString()} · {stats.total} total bookings</div>
      </div>

      <div className="stat-grid">
        <div className="stat-card green"><div className="stat-label">Total Revenue</div><div className="stat-value">₹{fmt(stats.revenue)}</div><div className="stat-sub">{stats.confirmed} confirmed</div></div>
        <div className="stat-card blue"><div className="stat-label">Today</div><div className="stat-value">{stats.todayBookings}</div><div className="stat-sub">₹{fmt(stats.todayRevenue)} today</div></div>
        <div className="stat-card purple"><div className="stat-label">Parties</div><div className="stat-value">{parties.length}</div><div className="stat-sub">active accounts</div></div>
        <div className="stat-card green"><div className="stat-label">Receivable</div><div className="stat-value">₹{fmt(totalReceivable)}</div><div className="stat-sub">you'll get</div></div>
        <div className="stat-card red"><div className="stat-label">Payable</div><div className="stat-value">₹{fmt(totalPayable)}</div><div className="stat-sub">you'll give</div></div>
        <div className="stat-card warn"><div className="stat-label">Top Route</div><div className="stat-value" style={{ fontSize: 16 }}>{stats.topRoute}</div><div className="stat-sub">most booked</div></div>
      </div>

      {/* Explore buttons */}
      <div className="explore-row">
        <div className="explore-btn booking" onClick={onExploreBookings}>
          <div className="explore-icon">✈️</div>
          <div className="explore-title">Explore Bookings</div>
          <div className="explore-sub">Charts, trends & analytics for all bookings</div>
        </div>
        <div className="explore-btn party" onClick={onExploreParties}>
          <div className="explore-icon">👥</div>
          <div className="explore-title">Explore Parties</div>
          <div className="explore-sub">Party-wise revenue, balances & transactions</div>
        </div>
      </div>

      {/* Booking Revenue Bar Chart */}
      <ChartSection title="📊 Booking Revenue" customStart={customStart} customEnd={customEnd} setCustomStart={setCustomStart} setCustomEnd={setCustomEnd}>
        {(period) => <BarChart data={getBookingChartData(period)} color="#2ea043" />}
      </ChartSection>

      {/* Party Revenue Bar Chart */}
      <ChartSection title="👥 Party-wise Revenue" defaultPeriod="month" customStart={customStart} customEnd={customEnd} setCustomStart={setCustomStart} setCustomEnd={setCustomEnd}>
        {(period) => <BarChart data={getPartyChartData(period)} color="#a371f7" />}
      </ChartSection>

      {/* Pie Charts row */}
      <div className="two-col" style={{ gap: 16, marginBottom: 20 }}>
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-title"><span>🎯 Booking Status</span></div>
          <PieChart slices={statusPie} />
        </div>
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-title"><span>🏷️ Booking Tags</span></div>
          <PieChart slices={tagPie.length ? tagPie : [{ label: "No tags", value: 1, color: "#7d8590" }]} />
        </div>
      </div>

      {/* Recent */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div>
          <div className="section-title">Recent Bookings</div>
          {bookings.slice(0, 4).map(b => <BookingCard key={b.id} b={b} parties={parties} onClick={onCardClick} />)}
          {bookings.length > 4 && <button className="btn btn-ghost" style={{ width: "100%", marginTop: 8 }} onClick={onViewAll}>View all bookings →</button>}
        </div>
        <div>
          <div className="section-title">Party Balances</div>
          {parties.slice(0, 4).map(p => <PartyCard key={p.id} party={p} ledger={ledger} bookings={bookings} onClick={onViewParty} />)}
          {parties.length > 4 && <button className="btn btn-ghost" style={{ width: "100%", marginTop: 8 }} onClick={onViewAllParties}>View all parties →</button>}
        </div>
      </div>
    </div>
  );
}

// ── EXPLORE BOOKINGS ───────────────────────────────────────────────────────
function ExploreBookings({ bookings, parties, onBack }) {
  const [customStart, setCustomStart] = useState(() => { const d = new Date(); d.setMonth(0); d.setDate(1); return d.toISOString().split("T")[0]; });
  const [customEnd, setCustomEnd] = useState(today);

  const getRevData = (period) => {
    const filtered = filterByPeriod(bookings, period, "bookingDate", customStart, customEnd);
    if (period === "week") {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (6 - i));
        const key = d.toISOString().split("T")[0];
        const lbl = d.toLocaleDateString("en-IN", { weekday: "short" });
        const value = filtered.filter(b => b.bookingDate === key).reduce((s, b) => s + (Number(b.total)||0), 0);
        return { label: lbl, value };
      });
    }
    if (period === "month") {
      const now = new Date();
      const days = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
      return Array.from({ length: days }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth(), i+1);
        const key = d.toISOString().split("T")[0];
        const value = filtered.filter(b => b.bookingDate === key).reduce((s, b) => s + (Number(b.total)||0), 0);
        return { label: String(i+1), value };
      });
    }
    if (period === "year") {
      return Array.from({ length: 12 }, (_, m) => {
        const d = new Date(new Date().getFullYear(), m, 1);
        const key = `${d.getFullYear()}-${String(m+1).padStart(2,"0")}`;
        const lbl = d.toLocaleDateString("en-IN", { month: "short" });
        const value = filtered.filter(b => b.bookingDate.startsWith(key)).reduce((s, b) => s + (Number(b.total)||0), 0);
        return { label: lbl, value };
      });
    }
    // custom
    const start = customStart ? new Date(customStart) : new Date();
    const end = customEnd ? new Date(customEnd) : new Date();
    const diff = Math.ceil((end - start) / (1000*60*60*24));
    const step = Math.max(1, Math.floor(diff / 12));
    return Array.from({ length: Math.ceil(diff / step) + 1 }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i * step);
      const key = d.toISOString().split("T")[0];
      const lbl = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
      const value = filtered.filter(b => b.bookingDate === key).reduce((s, b) => s + (Number(b.total)||0), 0);
      return { label: lbl, value };
    });
  };

  const getCountData = (period) => {
    const filtered = filterByPeriod(bookings, period, "bookingDate", customStart, customEnd);
    if (period === "week") {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (6 - i));
        const key = d.toISOString().split("T")[0];
        const lbl = d.toLocaleDateString("en-IN", { weekday: "short" });
        return { label: lbl, value: filtered.filter(b => b.bookingDate === key).length };
      });
    }
    if (period === "month") {
      const now = new Date();
      const days = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
      return Array.from({ length: days }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth(), i+1);
        const key = d.toISOString().split("T")[0];
        return { label: String(i+1), value: filtered.filter(b => b.bookingDate === key).length };
      });
    }
    if (period === "year") {
      return Array.from({ length: 12 }, (_, m) => {
        const d = new Date(new Date().getFullYear(), m, 1);
        const key = `${d.getFullYear()}-${String(m+1).padStart(2,"0")}`;
        const lbl = d.toLocaleDateString("en-IN", { month: "short" });
        return { label: lbl, value: filtered.filter(b => b.bookingDate.startsWith(key)).length };
      });
    }
    return [];
  };

  const airlinePie = Object.entries(
    bookings.reduce((acc, b) => { acc[b.airline] = (acc[b.airline]||0) + 1; return acc; }, {})
  ).map(([label, value], i) => ({ label, value, color: ["#2ea043","#58a6ff","#a371f7","#f59e0b","#f85149","#ec4899"][i%6] })).slice(0,6);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
        <div className="page-title">✈️ Booking Analytics</div>
      </div>

      <div className="stat-grid">
        <div className="stat-card blue"><div className="stat-label">Total Bookings</div><div className="stat-value">{bookings.length}</div></div>
        <div className="stat-card green"><div className="stat-label">Confirmed</div><div className="stat-value">{bookings.filter(b=>b.status==="confirmed").length}</div></div>
        <div className="stat-card red"><div className="stat-label">Cancelled</div><div className="stat-value">{bookings.filter(b=>b.status==="cancelled").length}</div></div>
        <div className="stat-card green"><div className="stat-label">Total Revenue</div><div className="stat-value" style={{fontSize:18}}>₹{fmt(bookings.filter(b=>b.status==="confirmed").reduce((s,b)=>s+(Number(b.total)||0),0))}</div></div>
      </div>

      <ChartSection title="💰 Revenue Over Time" customStart={customStart} customEnd={customEnd} setCustomStart={setCustomStart} setCustomEnd={setCustomEnd}>
        {(period) => <BarChart data={getRevData(period)} color="#2ea043" />}
      </ChartSection>

      <ChartSection title="🎫 Tickets Booked" defaultPeriod="month" customStart={customStart} customEnd={customEnd} setCustomStart={setCustomStart} setCustomEnd={setCustomEnd}>
        {(period) => <BarChart data={getCountData(period)} color="#58a6ff" />}
      </ChartSection>

      <div className="two-col" style={{ gap: 16, marginBottom: 20 }}>
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-title"><span>✈️ Airline Distribution</span></div>
          <PieChart slices={airlinePie} />
        </div>
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-title"><span>🎯 Status Mix</span></div>
          <PieChart slices={[
            { label: "Confirmed", value: bookings.filter(b=>b.status==="confirmed").length, color: "#22c55e" },
            { label: "Cancelled", value: bookings.filter(b=>b.status==="cancelled").length, color: "#ef4444" },
            { label: "Pending", value: bookings.filter(b=>b.status==="pending").length, color: "#3b82f6" },
          ].filter(s=>s.value>0)} />
        </div>
      </div>
    </div>
  );
}

// ── EXPLORE PARTIES ────────────────────────────────────────────────────────
function ExploreParties({ parties, bookings, ledger, onBack }) {
  const [customStart, setCustomStart] = useState(() => { const d = new Date(); d.setMonth(0); d.setDate(1); return d.toISOString().split("T")[0]; });
  const [customEnd, setCustomEnd] = useState(today);

  const partyRevData = (period) => {
    const filtered = filterByPeriod(ledger, period, "date", customStart, customEnd);
    return parties.map(p => ({
      label: p.name.slice(0,10),
      value: filtered.filter(e=>e.partyId===p.id && e.type==="invoice").reduce((s,e)=>s+(Number(e.amount)||0),0)
    })).sort((a,b)=>b.value-a.value).slice(0,8);
  };

  const partyPayData = (period) => {
    const filtered = filterByPeriod(ledger, period, "date", customStart, customEnd);
    return parties.map(p => ({
      label: p.name.slice(0,10),
      value: filtered.filter(e=>e.partyId===p.id && e.type==="receipt").reduce((s,e)=>s+(Number(e.amount)||0),0)
    })).sort((a,b)=>b.value-a.value).slice(0,8);
  };

  const typePie = PARTY_TYPES.map((t, i) => ({
    label: t, value: parties.filter(p=>p.type===t).length,
    color: ["#a371f7","#58a6ff","#2ea043","#f59e0b"][i]
  })).filter(s=>s.value>0);

  const balancePie = [
    { label: "To Get", value: parties.reduce((s,p)=>{ const b=partyBalance(p.id,ledger); return s+(b>0?b:0); },0), color: "#22c55e" },
    { label: "To Give", value: parties.reduce((s,p)=>{ const b=partyBalance(p.id,ledger); return s+(b<0?Math.abs(b):0); },0), color: "#ef4444" },
  ].filter(s=>s.value>0);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
        <div className="page-title">👥 Party Analytics</div>
      </div>

      <div className="stat-grid">
        <div className="stat-card purple"><div className="stat-label">Total Parties</div><div className="stat-value">{parties.length}</div></div>
        <div className="stat-card green"><div className="stat-label">Receivable</div><div className="stat-value" style={{fontSize:18}}>₹{fmt(parties.reduce((s,p)=>{ const b=partyBalance(p.id,ledger); return s+(b>0?b:0); },0))}</div></div>
        <div className="stat-card red"><div className="stat-label">Payable</div><div className="stat-value" style={{fontSize:18}}>₹{fmt(parties.reduce((s,p)=>{ const b=partyBalance(p.id,ledger); return s+(b<0?Math.abs(b):0); },0))}</div></div>
        <div className="stat-card blue"><div className="stat-label">Total Txns</div><div className="stat-value">{ledger.length}</div></div>
      </div>

      <ChartSection title="📈 Party-wise Revenue (Invoiced)" customStart={customStart} customEnd={customEnd} setCustomStart={setCustomStart} setCustomEnd={setCustomEnd}>
        {(period) => <BarChart data={partyRevData(period)} color="#a371f7" />}
      </ChartSection>

      <ChartSection title="💳 Party-wise Payments Received" defaultPeriod="month" customStart={customStart} customEnd={customEnd} setCustomStart={setCustomStart} setCustomEnd={setCustomEnd}>
        {(period) => <BarChart data={partyPayData(period)} color="#2ea043" />}
      </ChartSection>

      <div className="two-col" style={{ gap: 16, marginBottom: 20 }}>
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-title"><span>🏷️ Party Types</span></div>
          <PieChart slices={typePie} />
        </div>
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-title"><span>💰 Balance Split</span></div>
          <PieChart slices={balancePie.length ? balancePie : [{ label: "All Settled", value: 1, color: "#7d8590" }]} />
        </div>
      </div>
    </div>
  );
}

// ── BOOKINGS LIST ──────────────────────────────────────────────────────────
function BookingsList({ bookings, parties, onCardClick, onNew, onGenerateReport }) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterParty, setFilterParty] = useState("all");
  const [sortBy, setSortBy] = useState("bookingDate");

  const filtered = useMemo(() => {
    let list = [...bookings];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(b =>
        b.passengerName?.toLowerCase().includes(q) || b.pnr?.toLowerCase().includes(q) ||
        b.from?.toLowerCase().includes(q) || b.to?.toLowerCase().includes(q) || b.airline?.toLowerCase().includes(q)
      );
    }
    if (filterStatus !== "all") list = list.filter(b => b.status === filterStatus);
    if (filterParty !== "all") list = list.filter(b => b.partyId === filterParty);
    list.sort((a, b) => {
      if (sortBy === "total") return (b.total||0)-(a.total||0);
      return (b[sortBy]||"").localeCompare(a[sortBy]||"");
    });
    return list;
  }, [bookings, search, filterStatus, filterParty, sortBy]);

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Bookings <span style={{ color: "var(--muted)", fontSize: 14, fontWeight: 400 }}>({filtered.length})</span></div></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => onGenerateReport("bookings", filtered, parties)}>📄 Report</button>
          <button className="btn btn-primary" onClick={onNew}>+ New Booking</button>
        </div>
      </div>
      <div className="search-row">
        <input className="search-input" placeholder="Search name, PNR, route…" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="filter-sel" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Status</option>
          {["confirmed","cancelled","refunded","pending"].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="filter-sel" value={filterParty} onChange={e => setFilterParty(e.target.value)}>
          <option value="all">All Parties</option>
          {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="filter-sel" value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="bookingDate">Sort: Booked</option>
          <option value="travelDate">Sort: Travel</option>
          <option value="total">Sort: Amount</option>
        </select>
      </div>
      {filtered.length === 0
        ? <div className="empty"><div className="empty-icon">🔍</div><div className="empty-text">No bookings match</div></div>
        : filtered.map(b => <BookingCard key={b.id} b={b} parties={parties} onClick={onCardClick} />)
      }
    </div>
  );
}

// ── BOOKING FORM ───────────────────────────────────────────────────────────
function BookingForm({ form, setForm, errors, parties, onSave, onCancel, onDelete, scraping, onTicketDrop }) {
  const [dropOver, setDropOver] = useState(false);
  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const toggleTag = t => setForm(p => ({ ...p, tags: (p.tags||[]).includes(t) ? p.tags.filter(x=>x!==t) : [...(p.tags||[]), t] }));
  const total = calcTotal(form);

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">{form.id ? "Edit Booking" : "New Booking"}</div></div>
      </div>
      <div className={`ticket-drop${dropOver?" over":""}${scraping?" over":""}`}
        onDragOver={e => { e.preventDefault(); setDropOver(true); }}
        onDragLeave={() => setDropOver(false)}
        onDrop={e => { e.preventDefault(); setDropOver(false); const f = e.dataTransfer.files[0]; if (f) onTicketDrop(f); }}>
        <input type="file" accept="image/*,.pdf" onChange={e => { if (e.target.files[0]) onTicketDrop(e.target.files[0]); }} />
        <div className="ticket-drop-title">{scraping ? "⏳ Scanning ticket…" : "📎 Drop / click to auto-fill from ticket"}</div>
        <div className="ticket-drop-sub">AI reads PNR, route, fare from image</div>
      </div>
      <div className="form-wrap">
        <div className="form-grid">
          <div className="fg">
            <label className="flabel">PNR <span className="req">*</span></label>
            <input className={`finput${errors.pnr?" err":""}`} placeholder="ABC123" value={form.pnr} onChange={e => upd("pnr", e.target.value.toUpperCase())} />
            {errors.pnr && <span className="errmsg">{errors.pnr}</span>}
          </div>
          <div className="fg">
            <label className="flabel">Party <span style={{ fontWeight: 400, textTransform: "none", color: "var(--muted)" }}>(optional)</span></label>
            <select className="finput" value={form.partyId || ""} onChange={e => upd("partyId", e.target.value)}>
              <option value="">No party — direct </option>
              {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            
          </div>
          <div className="fg">
            <label className="flabel">Passenger Name <span className="req">*</span></label>
            <input className={`finput${errors.passengerName?" err":""}`} placeholder="Full name" value={form.passengerName} onChange={e => upd("passengerName", e.target.value)} />
            {errors.passengerName && <span className="errmsg">{errors.passengerName}</span>}
          </div>
          <div className="fg">
            <label className="flabel">Phone</label>
            <input className="finput" placeholder="10-digit number" value={form.phone} onChange={e => upd("phone", e.target.value)} />
          </div>
          <div className="fg">
            <label className="flabel">Airline <span className="req">*</span></label>
            <select className={`finput${errors.airline?" err":""}`} value={form.airline} onChange={e => upd("airline", e.target.value)}>
              <option value="">Select airline</option>
              {AIRLINES.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            {errors.airline && <span className="errmsg">{errors.airline}</span>}
          </div>
          <div className="fg">
            <label className="flabel">Flight No</label>
            <input className="finput" placeholder="6E-204" value={form.flightNo} onChange={e => upd("flightNo", e.target.value.toUpperCase())} />
          </div>
          <div className="fg">
            <label className="flabel">From <span className="req">*</span></label>
            <input
              className={`finput${errors.from ? " err" : ""}`}
              list="airport-datalist-skybook"
              placeholder="Type IATA or choose airport"
              autoComplete="off"
              value={form.from}
              onChange={e => upd("from", e.target.value)}
            />
            
            {errors.from && <span className="errmsg">{errors.from}</span>}
          </div>
          <div className="fg">
            <label className="flabel">To <span className="req">*</span></label>
            <input
              className={`finput${errors.to ? " err" : ""}`}
              list="airport-datalist-skybook"
              placeholder="Type IATA or choose airport"
              autoComplete="off"
              value={form.to}
              onChange={e => upd("to", e.target.value)}
            />
            
            {errors.to && <span className="errmsg">{errors.to}</span>}
          </div>
          <datalist id="airport-datalist-skybook">
            {AIRPORT_OPTIONS.map((a) => <option key={a} value={a} />)}
          </datalist>
          <div className="fg">
            <label className="flabel">Travel Date <span className="req">*</span></label>
            <input type="date" className={`finput${errors.travelDate?" err":""}`} value={form.travelDate} onChange={e => upd("travelDate", e.target.value)} />
            {errors.travelDate && <span className="errmsg">{errors.travelDate}</span>}
          </div>
          <div className="fg">
            <label className="flabel">Booking Date</label>
            <input type="date" className="finput" value={form.bookingDate} onChange={e => upd("bookingDate", e.target.value)} />
          </div>
          <div className="fg">
            <label className="flabel">Departure</label>
            <input type="time" className="finput" value={form.departure} onChange={e => upd("departure", e.target.value)} />
          </div>
          <div className="fg">
            <label className="flabel">Arrival</label>
            <input type="time" className="finput" value={form.arrival} onChange={e => upd("arrival", e.target.value)} />
          </div>
          <div className="fg">
            <label className="flabel">Base Fare <span className="req">*</span></label>
            <input type="number" className={`finput${errors.baseFare?" err":""}`} placeholder="0" value={form.baseFare} onChange={e => upd("baseFare", e.target.value)} />
            {errors.baseFare && <span className="errmsg">{errors.baseFare}</span>}
          </div>
          <div className="fg">
            <label className="flabel">Taxes</label>
            <input type="number" className="finput" placeholder="0" value={form.taxes} onChange={e => upd("taxes", e.target.value)} />
          </div>
          <div className="fg">
            <label className="flabel">Agency Fee</label>
            <input type="number" className="finput" placeholder="300" value={form.agencyFee} onChange={e => upd("agencyFee", e.target.value)} />
          </div>
          <div className="fg">
            <label className="flabel">Status</label>
            <select className="finput" value={form.status} onChange={e => upd("status", e.target.value)}>
              {["confirmed","pending","cancelled","refunded"].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="fg full">
            <div className="total-box">
              <div className="total-row"><span>Base Fare</span><span>₹{fmt(form.baseFare)}</span></div>
              <div className="total-row"><span>Taxes</span><span>₹{fmt(form.taxes)}</span></div>
              <div className="total-row"><span>Agency Fee</span><span>₹{fmt(form.agencyFee)}</span></div>
              <div className="total-final"><span>TOTAL</span><span>₹{fmt(total)}</span></div>
            </div>
          </div>
          <div className="fg full">
            <label className="flabel">Tags</label>
            <div className="tag-row">
              {["business","leisure","group","urgent"].map(t => {
                const on = (form.tags||[]).includes(t);
                return <button key={t} type="button" className="tag-btn"
                  style={{ background: on ? TAG_COLORS[t]+"22":"transparent", color: TAG_COLORS[t], borderColor: TAG_COLORS[t]+(on?"aa":"44") }}
                  onClick={() => toggleTag(t)}>{t}</button>;
              })}
            </div>
          </div>
          <div className="fg full">
            <label className="flabel">Notes</label>
            <textarea className="finput" rows={2} placeholder="Any special notes…" value={form.notes} onChange={e => upd("notes", e.target.value)} style={{ resize:"vertical" }} />
          </div>
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={onSave}>💾 {form.id ? "Update" : "Save Booking"}</button>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          {form.id && <button className="btn btn-danger" onClick={() => onDelete(form.id)}>🗑 Delete</button>}
        </div>
      </div>
    </div>
  );
}

// ── BOOKING DETAIL ─────────────────────────────────────────────────────────
function BookingDetail({ booking, parties, onBack, onEdit, onDelete }) {
  if (!booking) return null;
  const b = booking;
  const party = parties.find(p => p.id === b.partyId);
  return (
    <div>
      <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
        <button className="btn btn-ghost btn-sm" onClick={() => onEdit(b)}>✏️ Edit</button>
        <button className="btn btn-danger btn-sm" onClick={() => onDelete(b.id)}>🗑 Delete</button>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:20, gap:12, flexWrap:"wrap" }}>
        <div>
          <div style={{ fontFamily:"var(--mono)", fontSize:24, fontWeight:700 }}>{b.pnr}</div>
          <div style={{ fontSize:14, color:"var(--muted)", marginTop:2 }}>{b.airline} · {b.flightNo}</div>
          <div style={{ marginTop:8, display:"flex", gap:8, flexWrap:"wrap" }}>
            <span className="badge" style={{ background:STATUS_COLORS[b.status], color:"#fff" }}>{b.status}</span>
            {(b.tags||[]).map(t => <span key={t} className="badge badge-tag" style={{ color:TAG_COLORS[t], borderColor:TAG_COLORS[t] }}>{t}</span>)}
          </div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:28, fontWeight:800, color:"var(--accent)" }}>₹{fmt(b.total)}</div>
          <div style={{ fontSize:11, color:"var(--muted)", fontFamily:"var(--mono)" }}>TOTAL FARE</div>
        </div>
      </div>
      <div className="detail-route">
        <div className="d-iata"><div className="d-code">{b.from}</div><div className="d-time">{b.departure||"—"}</div></div>
        <div className="d-line" />
        <div className="d-iata" style={{ textAlign:"right" }}><div className="d-code">{b.to}</div><div className="d-time">{b.arrival||"—"}</div></div>
      </div>
      <div className="detail-grid">
        {[["Passenger",b.passengerName],["Phone",b.phone||"—"],["Travel Date",b.travelDate],["Booking Date",b.bookingDate],["Base Fare",`₹${fmt(b.baseFare)}`],["Taxes",`₹${fmt(b.taxes)}`],["Agency Fee",`₹${fmt(b.agencyFee)}`],["Party / Agent",party?.name||"—"]].map(([l,v]) => (
          <div key={l} className="d-field"><div className="d-field-label">{l}</div><div className="d-field-value">{v}</div></div>
        ))}
        {b.notes && <div className="d-field" style={{ gridColumn:"1/-1" }}><div className="d-field-label">Notes</div><div className="d-field-value">{b.notes}</div></div>}
      </div>
    </div>
  );
}

// ── PARTIES LIST ───────────────────────────────────────────────────────────
function PartiesList({ parties, ledger, bookings, onSelect, onNew, onGenerateReport }) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");

  const filtered = useMemo(() => {
    let list = [...parties];
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(p => p.name.toLowerCase().includes(q) || p.city?.toLowerCase().includes(q)); }
    if (filterType !== "all") list = list.filter(p => p.type === filterType);
    return list;
  }, [parties, search, filterType]);

  const totalReceivable = parties.reduce((s, p) => { const b = partyBalance(p.id, ledger); return s + (b > 0 ? b : 0); }, 0);
  const totalPayable = parties.reduce((s, p) => { const b = partyBalance(p.id, ledger); return s + (b < 0 ? Math.abs(b) : 0); }, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Party Details</div>
          <div className="page-sub">Manage agents, corporates & clients</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => onGenerateReport("parties", filtered, parties, ledger, bookings)}>📄 Report</button>
          <button className="btn btn-purple" onClick={onNew}>+ Add Party</button>
        </div>
      </div>
      <div className="stat-grid" style={{ marginBottom:20 }}>
        <div className="stat-card purple"><div className="stat-label">Total Parties</div><div className="stat-value">{parties.length}</div></div>
        <div className="stat-card green"><div className="stat-label">Total Receivable</div><div className="stat-value">₹{fmt(totalReceivable)}</div><div className="stat-sub">you'll get</div></div>
        <div className="stat-card red"><div className="stat-label">Total Payable</div><div className="stat-value">₹{fmt(totalPayable)}</div><div className="stat-sub">you'll give</div></div>
      </div>
      <div className="search-row">
        <input className="search-input" placeholder="Search party name, city…" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="filter-sel" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">All Types</option>
          {PARTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      {filtered.length === 0
        ? <div className="empty"><div className="empty-icon">👥</div><div className="empty-text">No parties found</div><button className="btn btn-purple" style={{ marginTop:16 }} onClick={onNew}>Add First Party</button></div>
        : filtered.map(p => <PartyCard key={p.id} party={p} ledger={ledger} bookings={bookings} onClick={onSelect} />)
      }
    </div>
  );
}

// ── PARTY DETAIL ───────────────────────────────────────────────────────────
function PartyDetail({ party, ledger, bookings, parties, onBack, onEdit, onDelete, onAddPayment, onAddBooking, onEditLedger, onDeleteLedger, onGenerateReport }) {
  const [tab, setTab] = useState("ledger");
  if (!party) return null;

  const bal = partyBalance(party.id, ledger);
  const balClass = bal > 0 ? "get" : bal < 0 ? "give" : "zero";
  const ledgerRows = partyLedgerEntries(party.id, ledger);
  const partyBookings = bookings.filter(b => b.partyId === party.id);

  return (
    <div>
      <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
        <button className="btn btn-ghost btn-sm" onClick={() => onEdit(party)}>✏️ Edit</button>
        <button className="btn btn-danger btn-sm" onClick={() => onDelete(party.id)}>🗑 Delete</button>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800 }}>{party.name}</div>
          <div style={{ display:"flex", gap:10, marginTop:6, flexWrap:"wrap" }}>
            <span className="pc-type" style={{ color:"var(--purple)", borderColor:"rgba(163,113,247,.4)" }}>{party.type}</span>
            {party.city && <span style={{ fontSize:12, color:"var(--muted)" }}>📍 {party.city}</span>}
            {party.phone && <span style={{ fontSize:12, color:"var(--muted)" }}>📞 {party.phone}</span>}
          </div>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => onGenerateReport?.("parties", [party], parties, ledger, bookings)}>📄 Report</button>
          <button className="btn btn-primary btn-sm" onClick={() => onAddBooking(party.id)}>+ Booking</button>
          <button className="btn btn-purple btn-sm" onClick={() => onAddPayment(party)}>+ Payment</button>
        </div>
      </div>
      <div className={`balance-banner ${balClass}`}>
        <div>
          <div className="bb-label">{bal > 0 ? "Outstanding (You'll Get)" : bal < 0 ? "You Owe (You'll Give)" : "Account Settled"}</div>
          <div className={`bb-amount ${balClass}`}>₹{fmt(Math.abs(bal))}</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:11, color:"var(--muted)", fontFamily:"var(--mono)" }}>CREDIT LIMIT</div>
          <div style={{ fontSize:16, fontWeight:600 }}>₹{fmt(party.creditLimit||0)}</div>
        </div>
      </div>
      <div className="tabs">
        {[["ledger","Ledger / Statement"],["bookings",`Bookings (${partyBookings.length})`],["info","Party Info"]].map(([v,l]) => (
          <button key={v} className={`tab-btn${tab===v?" active":""}`} onClick={() => setTab(v)}>{l}</button>
        ))}
      </div>

      {tab === "ledger" && (
        <div>
          {ledgerRows.length === 0
            ? <div className="empty"><div className="empty-icon">📋</div><div className="empty-text">No transactions yet</div></div>
            : (
              <div style={{ overflowX:"auto" }}>
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Ref / Mode</th>
                      <th style={{ textAlign:"right" }}>Debit</th>
                      <th style={{ textAlign:"right" }}>Credit</th>
                      <th style={{ textAlign:"right" }}>Balance</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerRows.map(e => (
                      <tr key={e.id}>
                        <td style={{ fontFamily:"var(--mono)", fontSize:12, whiteSpace:"nowrap" }}>{e.date}</td>
                        <td>
                          <div>{e.description}</div>
                          {e.senderAccount && <div className="lt-desc">From: {e.senderAccount}</div>}
                          {e.receiverAccount && <div className="lt-desc">To: {e.receiverAccount}</div>}
                          {e.referenceNo && <div className="lt-desc">Ref: {e.referenceNo}</div>}
                          {e.transactionTime && <div className="lt-desc">Time: {e.transactionTime}</div>}
                          {e.notes && <div className="lt-desc">{e.notes}</div>}
                        </td>
                        <td style={{ fontFamily:"var(--mono)", fontSize:11, color:"var(--muted)" }}>
                          {e.mode || "—"}
                        </td>
                        <td style={{ textAlign:"right", fontFamily:"var(--mono)" }}>
                          {e.type === "invoice" ? <span className="lt-inv">₹{fmt(e.amount)}</span> : "—"}
                        </td>
                        <td style={{ textAlign:"right", fontFamily:"var(--mono)" }}>
                          {e.type === "receipt" ? <span className="lt-rec">₹{fmt(e.amount)}</span> : "—"}
                        </td>
                        <td style={{ textAlign:"right" }}>
                          <span className={`balance-cell ${e.running > 0 ? "lt-inv" : e.running < 0 ? "lt-rec" : ""}`}>₹{fmt(Math.abs(e.running))}</span>
                          {e.running !== 0 && <div style={{ fontSize:10, color:"var(--muted)", fontFamily:"var(--mono)" }}>{e.running > 0 ? "to get" : "to give"}</div>}
                        </td>
                        <td>
                          <div className="lt-ledger-actions">
                            <button type="button" className="lt-edit-btn" onClick={() => onEditLedger(e)} title="Edit">✏️</button>
                            <button type="button" className="lt-del-btn" onClick={() => onDeleteLedger?.(e)} title="Delete">🗑</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
      )}

      {tab === "bookings" && (
        <div>
          {partyBookings.length === 0
            ? <div className="empty"><div className="empty-icon">✈️</div><div className="empty-text">No bookings for this party</div></div>
            : partyBookings.map(b => <BookingCard key={b.id} b={b} parties={[party]} onClick={() => {}} />)
          }
        </div>
      )}

      {tab === "info" && (
        <div className="form-wrap">
          <div className="detail-grid">
            {[["Name",party.name],["Type",party.type],["Phone",party.phone||"—"],["Email",party.email||"—"],["City",party.city||"—"],["GSTIN",party.gstin||"—"],["Credit Limit",`₹${fmt(party.creditLimit)}`],["Member Since",party.createdAt||"—"]].map(([l,v]) => (
              <div key={l} className="d-field"><div className="d-field-label">{l}</div><div className="d-field-value">{v}</div></div>
            ))}
            {party.notes && <div className="d-field" style={{ gridColumn:"1/-1" }}><div className="d-field-label">Notes</div><div className="d-field-value">{party.notes}</div></div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── PARTY FORM ─────────────────────────────────────────────────────────────
function PartyForm({ form, setForm, errors, onSave, onCancel }) {
  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div>
      <div className="page-header">
        <div className="page-title">{form.id ? "Edit Party" : "Add New Party"}</div>
      </div>
      <div className="form-wrap">
        <div className="form-grid">
          <div className="fg full">
            <label className="flabel">Party Name <span className="req">*</span></label>
            <input className={`finput${errors.name?" err":""}`} placeholder="Name of the party" value={form.name} onChange={e => upd("name", e.target.value)} />
            {errors.name && <span className="errmsg">{errors.name}</span>}
          </div>
          <div className="fg">
            <label className="flabel">Type</label>
            <select className="finput" value={form.type} onChange={e => upd("type", e.target.value)}>
              {PARTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="fg">
            <label className="flabel">Phone</label>
            <input className="finput" placeholder="10-digit number" value={form.phone} onChange={e => upd("phone", e.target.value)} />
          </div>
          <div className="fg">
            <label className="flabel">Email</label>
            <input className="finput" placeholder="party@email.com" value={form.email} onChange={e => upd("email", e.target.value)} />
          </div>
          <div className="fg">
            <label className="flabel">City</label>
            <input className="finput" placeholder="Patna" value={form.city} onChange={e => upd("city", e.target.value)} />
          </div>
          <div className="fg">
            <label className="flabel">GSTIN</label>
            <input className="finput" placeholder="Optional" value={form.gstin} onChange={e => upd("gstin", e.target.value)} />
          </div>
          <div className="fg">
            <label className="flabel">Credit Limit (₹)</label>
            <input type="number" className="finput" placeholder="100000" value={form.creditLimit} onChange={e => upd("creditLimit", e.target.value)} />
          </div>
          <div className="fg full">
            <label className="flabel">Notes</label>
            <textarea className="finput" rows={2} placeholder="Any notes about this party…" value={form.notes} onChange={e => upd("notes", e.target.value)} style={{ resize:"vertical" }} />
          </div>
        </div>
        <div className="btn-row">
          <button className="btn btn-purple" onClick={onSave}>💾 {form.id ? "Update Party" : "Save Party"}</button>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── PAYMENT MODAL with Scanner ─────────────────────────────────────────────
function PaymentModal({ parties, defaultPartyId, onSave, onClose, showToast }) {
  const [form, setForm] = useState({ ...EMPTY_PAYMENT, partyId: defaultPartyId || "" });
  const [scanning, setScanning] = useState(false);
  const [dropOver, setDropOver] = useState(false);
  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = () => {
    if (!form.partyId || !form.amount || isNaN(Number(form.amount))) return;
    onSave(form);
  };

  const handleScanDrop = async (file) => {
    setScanning(true);
    showToast("Scanning payment screenshot…", "info");
    try {
      const formData = new FormData();
      formData.append("payment", file);
      const resp = await authFetch(`${API_BASE}/scan-ticket/payment`, {
        method: "POST",
        body: formData,
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.message || "Could not scan payment screenshot.");
      const parsed = data?.data || {};
      setForm(prev => ({
        ...prev,
        amount: parsed.amount || prev.amount,
        senderAccount: parsed.senderAccount || prev.senderAccount,
        receiverAccount: parsed.receiverAccount || prev.receiverAccount,
        referenceNo: parsed.referenceNo || prev.referenceNo,
        mode: parsed.mode && PAYMENT_MODES.includes(parsed.mode) ? parsed.mode : prev.mode,
        date: parsed.date || prev.date,
        transactionTime: parsed.transactionTime || prev.transactionTime,
        description: parsed.description || prev.description,
      }));
      showToast("Payment details scanned! Review & save ✓");
    } catch (error) {
      showToast(error?.message || "Could not parse screenshot — fill manually", "error");
    }
    setScanning(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">💳 Record Payment / Transaction</div>

        {/* Scanner drop zone */}
        <div className={`scanner-drop${dropOver?" over":""}${scanning?" over":""}`}
          onDragOver={e => { e.preventDefault(); setDropOver(true); }}
          onDragLeave={() => setDropOver(false)}
          onDrop={e => { e.preventDefault(); setDropOver(false); const f = e.dataTransfer.files[0]; if (f) handleScanDrop(f); }}>
          <input type="file" accept="image/*" onChange={e => { if (e.target.files[0]) handleScanDrop(e.target.files[0]); }} />
          <div className="scanner-drop-title">{scanning ? "⏳ Scanning payment…" : "📸 Drop payment screenshot to auto-fill"}</div>
          <div className="scanner-drop-sub">AI reads sender, receiver, amount, reference no., date & time</div>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div className="fg">
            <label className="flabel">Party <span className="req">*</span></label>
            <select className="finput" value={form.partyId} onChange={e => upd("partyId", e.target.value)}>
              <option value="">Select party</option>
              {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="fg">
            <label className="flabel">Transaction Type</label>
            <select className="finput" value={form.type} onChange={e => upd("type", e.target.value)}>
              <option value="receipt">Receipt (Payment Received)</option>
              <option value="invoice">Invoice / Charge</option>
              <option value="credit_note">Credit Note</option>
            </select>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div className="fg">
              <label className="flabel">Amount (₹) <span className="req">*</span></label>
              <input type="number" className="finput" placeholder="0" value={form.amount} onChange={e => upd("amount", e.target.value)} />
            </div>
            <div className="fg">
              <label className="flabel">Date</label>
              <input type="date" className="finput" value={form.date} onChange={e => upd("date", e.target.value)} />
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div className="fg">
              <label className="flabel">Payment Mode</label>
              <select className="finput" value={form.mode} onChange={e => upd("mode", e.target.value)}>
                {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="flabel">Transaction Time</label>
              <input type="time" className="finput" value={form.transactionTime} onChange={e => upd("transactionTime", e.target.value)} />
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div className="fg">
              <label className="flabel">Sender Account</label>
              <input className="finput" placeholder="HDFC 4521 / UPI ID" value={form.senderAccount} onChange={e => upd("senderAccount", e.target.value)} />
            </div>
            <div className="fg">
              <label className="flabel">Receiver Account</label>
              <input className="finput" placeholder="SBI 7892 / UPI ID" value={form.receiverAccount} onChange={e => upd("receiverAccount", e.target.value)} />
            </div>
          </div>
          <div className="fg">
            <label className="flabel">Reference / UTR No.</label>
            <input className="finput" placeholder="IMPS2204221 / UTR…" value={form.referenceNo} onChange={e => upd("referenceNo", e.target.value)} />
          </div>
          <div className="fg">
            <label className="flabel">Description</label>
            <input className="finput" placeholder="Payment description…" value={form.description} onChange={e => upd("description", e.target.value)} />
          </div>
          <div className="fg">
            <label className="flabel">Notes</label>
            <input className="finput" placeholder="Optional notes…" value={form.notes} onChange={e => upd("notes", e.target.value)} />
          </div>
        </div>
        <div className="modal-btns" style={{ marginTop:20 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-purple" onClick={handleSave}>💰 Save Transaction</button>
        </div>
      </div>
    </div>
  );
}

// ── LEDGER EDIT MODAL ──────────────────────────────────────────────────────
function LedgerEditModal({ entry, parties, onSave, onClose }) {
  const [form, setForm] = useState({ ...entry });
  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">✏️ Edit Transaction</div>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div className="fg">
              <label className="flabel">Date</label>
              <input type="date" className="finput" value={form.date} onChange={e => upd("date", e.target.value)} />
            </div>
            <div className="fg">
              <label className="flabel">Amount (₹)</label>
              <input type="number" className="finput" value={form.amount} onChange={e => upd("amount", e.target.value)} />
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div className="fg">
              <label className="flabel">Type</label>
              <select className="finput" value={form.type} onChange={e => upd("type", e.target.value)}>
                <option value="receipt">Receipt</option>
                <option value="invoice">Invoice</option>
                <option value="credit_note">Credit Note</option>
              </select>
            </div>
            <div className="fg">
              <label className="flabel">Mode</label>
              <select className="finput" value={form.mode} onChange={e => upd("mode", e.target.value)}>
                <option value="">—</option>
                {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div className="fg">
              <label className="flabel">Transaction Time</label>
              <input type="time" className="finput" value={form.transactionTime||""} onChange={e => upd("transactionTime", e.target.value)} />
            </div>
            <div className="fg">
              <label className="flabel">Reference / UTR No.</label>
              <input className="finput" placeholder="Ref no…" value={form.referenceNo||""} onChange={e => upd("referenceNo", e.target.value)} />
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div className="fg">
              <label className="flabel">Sender Account</label>
              <input className="finput" placeholder="HDFC 4521" value={form.senderAccount||""} onChange={e => upd("senderAccount", e.target.value)} />
            </div>
            <div className="fg">
              <label className="flabel">Receiver Account</label>
              <input className="finput" placeholder="SBI 7892" value={form.receiverAccount||""} onChange={e => upd("receiverAccount", e.target.value)} />
            </div>
          </div>
          <div className="fg">
            <label className="flabel">Description</label>
            <input className="finput" value={form.description} onChange={e => upd("description", e.target.value)} />
          </div>
          <div className="fg">
            <label className="flabel">Notes</label>
            <input className="finput" value={form.notes} onChange={e => upd("notes", e.target.value)} />
          </div>
        </div>
        <div className="modal-btns" style={{ marginTop:20 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-purple" onClick={() => onSave(form)}>💾 Save Changes</button>
        </div>
      </div>
    </div>
  );
}

/** Travelese letterhead for PDF exports (jsPDF uses points; origin top-left). */
function drawPdfCompanyHeader(doc, x = 40, header = {}) {
  const pageW = doc.internal.pageSize.getWidth();
  let y = 28;
  const agencyName = String(header?.agencyName || "").trim() || "Agency Name: XYZ Travels";
  const address = String(header?.address || "").trim() || "Address: XYZ Travels";
  const phone = String(header?.phone || "").trim() || "Phone: XYZ Travels";
  const email = String(header?.email || "").trim() || "Email: XYZ Travels";
  const gstin = String(header?.gstin || "").trim() || "GSTIN: XYZ Travels";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(agencyName, x, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(address, x, y);
  y += 12;
  doc.text(`Phone: ${phone}    Email: ${email}`, x, y);
  y += 12;
  doc.text(gstin, x, y);
  y += 35;
  return y;
}

// ── REPORT MODAL ───────────────────────────────────────────────────────────
function ReportModal({ type, items, parties, ledger, bookings, header, onClose, showToast }) {
  const [period, setPeriod] = useState("month");
  const [customStart, setCustomStart] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0]; });
  const [customEnd, setCustomEnd] = useState(today);
  const [generating, setGenerating] = useState(false);

  const isSingleParty = type === "parties" && Array.isArray(items) && items.length === 1;

  const getFilteredItems = () => {
    if (type === "bookings") return filterByPeriod(items, period, "bookingDate", customStart, customEnd);
    if (type === "parties") {
      if (isSingleParty) return items;
      return filterByPeriod(items, period, "createdAt", customStart, customEnd);
    }
    return items;
  };

  const generatePDF = () => {
    setGenerating(true);

    try {
      const filtered = getFilteredItems();
      const now = new Date().toLocaleString("en-IN");
      const periodLabel = period === "custom" ? `${customStart} to ${customEnd}` : period;

      if (type === "bookings") {
        const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
        const total = filtered.reduce((s, b) => s + (Number(b.total) || 0), 0);
        const confirmed = filtered.filter((b) => b.status === "confirmed").length;
        const cancelled = filtered.filter((b) => b.status === "cancelled").length;

        let y = drawPdfCompanyHeader(doc, 40, header);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text("Bookings Report", 40, y);
        y += 16;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(`Generated: ${now} | Period: ${periodLabel}`, 40, y);
        y += 12;
        doc.text(`Total: ${filtered.length} | Confirmed: ${confirmed} | Cancelled: ${cancelled} | Revenue: INR ${fmt(total)}`, 40, y);
        y += 14;

        autoTable(doc, {
          startY: y,
          head: [[
            "#", "PNR", "Passenger", "Phone", "Route", "Airline", "Flight", "Travel", "Booking", "Status", "Party", "Base", "Taxes", "Fee", "Total",
          ]],
          body: filtered.map((b, i) => {
            const party = parties.find((p) => p.id === b.partyId);
            return [
              i + 1,
              b.pnr || "-",
              b.passengerName || "-",
              b.phone || "-",
              `${b.from || "-"}->${b.to || "-"}`,
              b.airline || "-",
              b.flightNo || "-",
              b.travelDate || "-",
              b.bookingDate || "-",
              b.status || "-",
              party?.name || "-",
              fmt(b.baseFare),
              fmt(b.taxes),
              fmt(b.agencyFee),
              fmt(b.total),
            ];
          }),
          styles: { fontSize: 8, cellPadding: 4 },
          headStyles: { fillColor: [34, 34, 34] },
        });

        doc.save(`bookings-report-${today()}.pdf`);
      } else {
        const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
        const singleParty = filtered.length === 1;
        let y = drawPdfCompanyHeader(doc, 40, header);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text(singleParty ? `Party statement — ${filtered[0]?.name || "-"}` : "Parties Report", 40, y);
        y += 16;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(`Generated: ${now} | Period: ${periodLabel}`, 40, y);
        y += 12;
        if (singleParty) {
          doc.setFontSize(8);
          doc.setTextColor(90, 90, 90);
          doc.text("Bookings and transactions below are limited to the selected period. Overall balance uses full ledger.", 40, y);
          doc.setTextColor(0, 0, 0);
          y += 14;
        } else {
          y += 10;
        }
        filtered.forEach((party, index) => {
          if (index > 0 && y > 690) {
            doc.addPage();
            y = 50;
          }

          const bal = partyBalance(party.id, ledger || []);
          const balLabel = bal > 0 ? `You'll Get INR ${fmt(Math.abs(bal))}` : bal < 0 ? `You'll Give INR ${fmt(Math.abs(bal))}` : "Account Settled";
          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          doc.text(`${party.name || "-"} (${(party.type || "unknown").toUpperCase()})`, 40, y);
          y += 14;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.text(`Phone: ${party.phone || "-"}  City: ${party.city || "-"}  Email: ${party.email || "-"}  GSTIN: ${party.gstin || "-"}  Credit: INR ${fmt(party.creditLimit)}`, 40, y);
          y += 12;
          doc.text(`Outstanding: ${balLabel}`, 40, y);
          y += 10;

          const partyBookingsAll = (bookings || []).filter((b) => b.partyId === party.id);
          const partyLedgerAll = (ledger || []).filter((e) => e.partyId === party.id);
          const partyBookings = singleParty
            ? filterByPeriod(partyBookingsAll, period, "bookingDate", customStart, customEnd)
            : partyBookingsAll;
          const partyLedger = singleParty
            ? filterByPeriod(partyLedgerAll, period, "date", customStart, customEnd)
            : partyLedgerAll;
          autoTable(doc, {
            startY: y,
            head: [["Bookings", "PNR", "Passenger", "Route", "Airline", "Travel Date", "Status", "Total"]],
            body: partyBookings.length
              ? partyBookings.map((b, i) => [
                  i + 1,
                  b.pnr || "-",
                  b.passengerName || "-",
                  `${b.from || "-"}->${b.to || "-"}`,
                  b.airline || "-",
                  b.travelDate || "-",
                  b.status || "-",
                  fmt(b.total),
                ])
              : [["-", "No bookings", "", "", "", "", "", ""]],
            styles: { fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [34, 34, 34] },
          });
          y = (doc.lastAutoTable?.finalY || y) + 10;

          autoTable(doc, {
            startY: y,
            head: [["Transactions", "Date", "Type", "Description", "Mode", "Ref No", "Sender", "Receiver", "Time", "Amount"]],
            body: partyLedger.length
              ? partyLedger.map((e, i) => [
                  i + 1,
                  e.date || "-",
                  e.type || "-",
                  e.description || "-",
                  e.mode || "-",
                  e.referenceNo || "-",
                  e.senderAccount || "-",
                  e.receiverAccount || "-",
                  e.transactionTime || "-",
                  fmt(e.amount),
                ])
              : [["-", "No transactions", "", "", "", "", "", "", "", ""]],
            styles: { fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [68, 68, 68] },
          });
          y = (doc.lastAutoTable?.finalY || y) + 20;
        });

        const partySlug = (filtered[0]?.name || "party").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 32) || "party";
        doc.save(singleParty ? `party-statement-${partySlug}-${today()}.pdf` : `parties-report-${today()}.pdf`);
      }

      showToast?.("PDF downloaded successfully.", "success");
    } catch {
      showToast?.("Could not generate PDF report. Please retry.", "error");
    } finally {
      setGenerating(false);
    }
  };

  const filtered = getFilteredItems();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">📄 Generate {type === "bookings" ? "Bookings" : isSingleParty ? "Party" : "Parties"} Report</div>
        <div className="modal-text">
          {type === "bookings"
            ? "Select date range for the report"
            : isSingleParty
              ? "Select period — bookings and ledger rows in the PDF match this range (overall balance still uses full ledger)."
              : "Select date range for the report"}
        </div>
        <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
          {["week","month","year","custom"].map(p => (
            <button key={p} className={`period-btn${period===p?" active":""}`} onClick={() => setPeriod(p)}>
              {p.charAt(0).toUpperCase()+p.slice(1)}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div className="date-range-row" style={{ marginBottom:16 }}>
            <label>From</label>
            <input type="date" className="finput" style={{ width:"auto" }} value={customStart} onChange={e => setCustomStart(e.target.value)} />
            <label>To</label>
            <input type="date" className="finput" style={{ width:"auto" }} value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
          </div>
        )}
        <div style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"12px 16px", marginBottom:20, fontSize:13 }}>
          <div style={{ color:"var(--muted)", fontSize:11, fontFamily:"var(--mono)", marginBottom:4 }}>REPORT PREVIEW</div>
          <div>
            {type === "bookings"
              ? `${filtered.length} bookings • ₹${filtered.reduce((s,b)=>s+(Number(b.total)||0),0).toLocaleString("en-IN")} total`
              : isSingleParty
                ? `${filtered[0]?.name || "Party"} • ${filterByPeriod((bookings || []).filter(b => b.partyId === filtered[0]?.id), period, "bookingDate", customStart, customEnd).length} bookings in period • ${filterByPeriod((ledger || []).filter(e => e.partyId === filtered[0]?.id), period, "date", customStart, customEnd).length} ledger rows in period`
                : `${filtered.length} parties included`}
          </div>
        </div>
        <div className="modal-btns">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={generatePDF} disabled={generating}>
            {generating ? "Generating…" : "🖨️ Print / Save PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── APP (main system — wrapped by auth in App.tsx) ─────────────────────────
export default function System({ userId }) {
  const navigate = useNavigate();
  const [bookings, setBookings]   = useState([]);
  const [parties, setParties]     = useState([]);
  const [ledger, setLedger]       = useState([]);
  const [view, setView]           = useState("dashboard");
  const [modal, setModal]         = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [bookingForm, setBookingForm]   = useState(EMPTY_BOOKING);
  const [bookingErrors, setBookingErrors] = useState({});
  const [partyForm, setPartyForm]       = useState(EMPTY_PARTY);
  const [partyErrors, setPartyErrors]   = useState({});

  const [selectedBooking, setSelectedBooking] = useState(null);
  const [selectedParty, setSelectedParty]     = useState(null);
  const [paymentDefaultParty, setPaymentDefaultParty] = useState("");
  const [editingLedger, setEditingLedger] = useState(null);
  const [reportConfig, setReportConfig] = useState(null);

  const [toast, setToast]     = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [scraping, setScraping] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState("");
  const [reportHeader, setReportHeader] = useState({ agencyName: "", address: "", phone: "", email: "", gstin: "" });
  const [savingReportHeader, setSavingReportHeader] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const profileRef = useRef(null);
  const photoInputRef = useRef(null);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    if (!userId) {
      setProfilePhoto("");
      setReportHeader({ agencyName: "", address: "", phone: "", email: "", gstin: "" });
      return;
    }
    const saved = localStorage.getItem(`profilePhoto:${userId}`) || "";
    setProfilePhoto(saved);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await authFetch(`${API_BASE}/settings/report-header`);
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(json?.message || "Could not load report header.");
        const data = json?.data || {};
        if (!cancelled) {
          setReportHeader({
            agencyName: String(data.agencyName || ""),
            address: String(data.address || ""),
            phone: String(data.phone || ""),
            email: String(data.email || ""),
            gstin: String(data.gstin || ""),
          });
        }
      } catch (e) {
        if (!cancelled) showToast(e?.message || "Could not load report header.", "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, showToast]);

  const updateReportHeaderDraft = (next) => {
    setReportHeader(next);
  };

  const persistReportHeader = async (nextHeader = reportHeader) => {
    if (!userId) return showToast("Sign in first.", "error");
    setSavingReportHeader(true);
    try {
      const resp = await authFetch(`${API_BASE}/settings/report-header`, {
        method: "PUT",
        body: JSON.stringify(nextHeader),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.message || "Could not save report header.");
      const saved = json?.data || nextHeader;
      setReportHeader({
        agencyName: String(saved.agencyName || ""),
        address: String(saved.address || ""),
        phone: String(saved.phone || ""),
        email: String(saved.email || ""),
        gstin: String(saved.gstin || ""),
      });
      showToast("Report header saved ✓");
    } catch (e) {
      showToast(e?.message || "Could not save report header.", "error");
    } finally {
      setSavingReportHeader(false);
    }
  };

  useEffect(() => {
    const onDown = (e) => {
      if (!profileOpen) return;
      const el = profileRef.current;
      if (el && !el.contains(e.target)) setProfileOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [profileOpen]);

  const handlePickPhoto = () => {
    if (!userId) return showToast("Sign in first.", "error");
    photoInputRef.current?.click?.();
  };

  const handlePhotoSelected = async (file) => {
    if (!userId) return;
    if (!file) return;
    if (!file.type?.startsWith("image/")) return showToast("Please select an image file.", "error");
    if (file.size > 2.5 * 1024 * 1024) return showToast("Image too large (max 2.5MB).", "error");
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || "");
      localStorage.setItem(`profilePhoto:${userId}`, url);
      setProfilePhoto(url);
      showToast("Profile photo updated ✓");
    };
    reader.onerror = () => showToast("Could not read that file.", "error");
    reader.readAsDataURL(file);
  };

  const openChangePassword = () => {
    setCurrentPassword("");
    setNewPassword("");
    setNewPassword2("");
    setModal("change-password");
    setProfileOpen(false);
  };

  const openProfile = () => {
    setProfileOpen(false);
    setModal("profile");
  };

  const submitChangePassword = async () => {
    const u = auth.currentUser;
    if (!u) return showToast("Not signed in. Please sign in again.", "error");
    if (!u.email) return showToast("Password change requires an email/password account.", "error");

    const cur = String(currentPassword || "");
    const p1 = String(newPassword || "");
    const p2 = String(newPassword2 || "");
    if (!cur) return showToast("Enter your current password.", "error");
    if (p1.length < 6) return showToast("Password must be at least 6 characters.", "error");
    if (p1 !== p2) return showToast("Passwords do not match.", "error");
    try {
      const cred = EmailAuthProvider.credential(u.email, cur);
      await reauthenticateWithCredential(u, cred);
      await updatePassword(u, p1);
      setModal(null);
      showToast("Password changed ✓");
    } catch (e) {
      const code = String(e?.code || "");
      if (code.includes("wrong-password") || code.includes("invalid-credential")) {
        showToast("Current password is incorrect.", "error");
      } else if (code.includes("too-many-requests")) {
        showToast("Too many attempts. Please wait and try again.", "error");
      } else if (code.includes("requires-recent-login")) {
        showToast("For security, please sign out and sign in again, then retry.", "error");
      } else {
        showToast(String(e?.message || "Could not change password."), "error");
      }
    }
  };

  useEffect(() => {
    if (!userId) {
      setBookings([]);
      setParties([]);
      setLedger([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        let resp = await authFetch(`${API_BASE}/bookings`);
        if (!resp.ok) {
          const msg =
            resp.status === 401 ? "Session expired. Sign in again." : "Could not load bookings from server.";
          throw new Error(msg);
        }
        let json = await resp.json();
        let data = Array.isArray(json?.data) ? json.data : [];

        if (!data.length) {
          resp = await authFetch(`${API_BASE}/bookings/seed`, {
            method: "POST",
            body: JSON.stringify({ data: SEED_BOOKINGS.map(toServerBooking) }),
          });
          if (resp.ok) {
            json = await resp.json();
            data = Array.isArray(json?.data) ? json.data : [];
          }
        }

        if (!cancelled) setBookings(data.map(normalizeBooking));

        resp = await authFetch(`${API_BASE}/parties`);
        if (!resp.ok) throw new Error("Could not load parties from server.");
        json = await resp.json();
        data = Array.isArray(json?.data) ? json.data : [];

        if (!data.length) {
          resp = await authFetch(`${API_BASE}/parties/seed`, {
            method: "POST",
            body: JSON.stringify({ data: SEED_PARTIES }),
          });
          if (resp.ok) {
            json = await resp.json();
            data = Array.isArray(json?.data) ? json.data : [];
          }
        }

        if (!cancelled) setParties(data.map(normalizeParty));

        resp = await authFetch(`${API_BASE}/ledger`);
        if (!resp.ok) throw new Error("Could not load ledger from server.");
        json = await resp.json();
        data = Array.isArray(json?.data) ? json.data : [];

        if (!data.length) {
          resp = await authFetch(`${API_BASE}/ledger/seed`, {
            method: "POST",
            body: JSON.stringify({ data: SEED_LEDGER }),
          });
          if (resp.ok) {
            json = await resp.json();
            data = Array.isArray(json?.data) ? json.data : [];
          }
        }

        if (!cancelled) setLedger(data.map(normalizeLedger));
      } catch (e) {
        if (!cancelled) {
          setBookings([]);
          setParties([]);
          setLedger([]);
          showToast(e?.message || "Could not load your data. Check server and auth configuration.", "error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, showToast]);

  const stats = useMemo(() => {
    const confirmed = bookings.filter(b => b.status==="confirmed");
    const tod = today();
    const todayB = bookings.filter(b => b.bookingDate===tod);
    const revenue = confirmed.reduce((s,b)=>s+(Number(b.total)||0),0);
    const todayRevenue = todayB.reduce((s,b)=>s+(Number(b.total)||0),0);
    const routes = {};
    bookings.forEach(b=>{ const r=`${b.from}→${b.to}`; routes[r]=(routes[r]||0)+1; });
    const topRoute = Object.entries(routes).sort((a,b)=>b[1]-a[1])[0];
    return { total:bookings.length, confirmed:confirmed.length, todayBookings:todayB.length, revenue, todayRevenue, topRoute:topRoute?.[0]||"—", cancelled:bookings.filter(b=>b.status==="cancelled").length };
  }, [bookings]);

  // Booking actions
  const validateBooking = (f) => {
    const e = {};
    if (!f.pnr.trim()) e.pnr = "PNR required";
    else if (bookings.find(b => b.pnr===f.pnr && (b._id||b.id)!==(f._id||f.id))) e.pnr = "Duplicate PNR";
    if (!f.passengerName.trim()) e.passengerName = "Name required";
    if (!f.travelDate) e.travelDate = "Date required";
    const fromIata = airportFieldToIata(f.from);
    const toIata = airportFieldToIata(f.to);
    if (!fromIata || fromIata.length < 3) e.from = "Origin required (3-letter IATA or pick from list)";
    if (!toIata || toIata.length < 3) e.to = "Destination required (3-letter IATA or pick from list)";
    if (fromIata.length === 3 && toIata.length === 3 && fromIata === toIata) e.to = "Same as origin";
    if (!f.airline) e.airline = "Airline required";
    if (!f.baseFare || isNaN(f.baseFare)) e.baseFare = "Valid fare required";
    // partyId / agent is optional — direct, retail, or special bookings without a party
    return e;
  };

  const saveBooking = async () => {
    const e = validateBooking(bookingForm);
    setBookingErrors(e);
    if (Object.keys(e).length) { showToast("Fix errors first","error"); return; }
    const total = calcTotal(bookingForm);
    const partyIdNorm =
      bookingForm.partyId != null && String(bookingForm.partyId).trim() !== ""
        ? String(bookingForm.partyId).trim()
        : "";
    const record = {
      ...bookingForm,
      partyId: partyIdNorm,
      total,
      from: airportFieldToIata(bookingForm.from),
      to: airportFieldToIata(bookingForm.to),
    };
    const isNew = !(bookingForm._id || bookingForm.id);

    try {
      const endpoint = isNew
        ? `${API_BASE}/bookings`
        : `${API_BASE}/bookings/${bookingForm._id || bookingForm.id}`;
      const method = isNew ? "POST" : "PUT";
      const resp = await authFetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toServerBooking(record)),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.message || "Could not save booking.");

      const saved = normalizeBooking(json?.data);
      const updated = isNew
        ? [saved, ...bookings]
        : bookings.map(b => (b._id || b.id) === saved._id ? saved : b);
      setBookings(updated);

      // Keep party / receivable charts in sync: invoice ledger row follows booking party & total
      const bookingKey = String(saved._id || saved.id || "");
      const hasParty = saved.partyId != null && String(saved.partyId).trim() !== "";
      const existingInvoice = ledger.find(
        (e) =>
          e.type === "invoice" &&
          bookingKey !== "" &&
          (String(e.refId || "") === bookingKey ||
            String(e.refId || "") === String(saved.id || "") ||
            String(e.refId || "") === String(saved._id || ""))
      );
      const invDescription = `Booking ${saved.pnr} – ${saved.passengerName} ${saved.from}→${saved.to}`;
      const invAmount = Number(saved.total) || 0;

      if (hasParty) {
        if (existingInvoice) {
          const { _id, __v, running, ...rest } = existingInvoice;
          const payload = {
            ...rest,
            id: existingInvoice.id,
            date: saved.bookingDate,
            partyId: String(saved.partyId).trim(),
            type: "invoice",
            refId: bookingKey,
            description: invDescription,
            amount: invAmount,
            mode: existingInvoice.mode ?? "",
            notes: existingInvoice.notes ?? "",
            senderAccount: existingInvoice.senderAccount ?? "",
            receiverAccount: existingInvoice.receiverAccount ?? "",
            referenceNo: existingInvoice.referenceNo ?? "",
            transactionTime: existingInvoice.transactionTime ?? "",
          };
          const ledgerResp = await authFetch(`${API_BASE}/ledger/${existingInvoice.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const ledgerJson = await ledgerResp.json().catch(() => ({}));
          if (!ledgerResp.ok) throw new Error(ledgerJson?.message || "Could not update invoice ledger entry.");
          const normalized = normalizeLedger(ledgerJson?.data);
          setLedger((prev) => prev.map((e) => (e.id === existingInvoice.id ? normalized : e)));
        } else {
          const entry = {
            id: uid(),
            date: saved.bookingDate,
            partyId: String(saved.partyId).trim(),
            type: "invoice",
            refId: bookingKey,
            description: invDescription,
            amount: invAmount,
            mode: "",
            notes: "",
            senderAccount: "",
            receiverAccount: "",
            referenceNo: "",
            transactionTime: "",
          };
          const ledgerResp = await authFetch(`${API_BASE}/ledger`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(entry),
          });
          const ledgerJson = await ledgerResp.json().catch(() => ({}));
          if (!ledgerResp.ok) throw new Error(ledgerJson?.message || "Could not create invoice ledger entry.");
          setLedger((prev) => [normalizeLedger(ledgerJson?.data), ...prev]);
        }
      } else if (existingInvoice) {
        const ledgerResp = await authFetch(`${API_BASE}/ledger/${existingInvoice.id}`, { method: "DELETE" });
        const ledgerJson = await ledgerResp.json().catch(() => ({}));
        if (!ledgerResp.ok) throw new Error(ledgerJson?.message || "Could not remove invoice ledger entry.");
        setLedger((prev) => prev.filter((e) => e.id !== existingInvoice.id));
      }

      showToast(isNew ? "Booking saved ✓" : "Booking updated ✓");
      setBookingForm(EMPTY_BOOKING); setBookingErrors({});
      setView("bookings");
    } catch (error) {
      showToast(error?.message || "Could not save booking", "error");
    }
  };

  const deleteBooking = async (id) => {
    const target = bookings.find(b=>(b._id||b.id)===id);
    setUndoStack(prev=>[...prev,{type:"booking",data:target}]);
    try {
      const resp = await authFetch(`${API_BASE}/bookings/${id}`, { method: "DELETE" });
      if (!resp.ok) {
        const json = await resp.json().catch(() => ({}));
        throw new Error(json?.message || "Could not delete booking.");
      }
      const updated = bookings.filter(b=>(b._id||b.id)!==id);
      setBookings(updated);
      setModal(null); setView("bookings");
      showToast("Deleted — tap to undo","warn");
      setTimeout(()=>setUndoStack(prev=>prev.filter(x=>x.data?.id!==id)),8000);
    } catch (error) {
      showToast(error?.message || "Could not delete booking", "error");
    }
  };

  const handleTicketDrop = async (file) => {
    setScraping(true); showToast("Scanning ticket…","info");
    try {
      const formData = new FormData();
      formData.append("ticket", file);
      const resp = await authFetch(`${API_BASE}/scan-ticket`, {
        method: "POST",
        body: formData,
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.message || "Could not scan ticket.");
      const parsed = data?.data || {};
      setBookingForm(prev=>({...prev,...parsed, bookingDate:today(), agencyFee:prev.agencyFee||300, currency:"INR", status:"confirmed"}));
      showToast("Ticket scanned! Review and save ✓");
    } catch (error) { showToast(error?.message || "Could not parse ticket — fill manually","error"); }
    setScraping(false);
  };

  // Party actions
  const saveParty = async () => {
    const e = {};
    if (!partyForm.name.trim()) e.name = "Party name required";
    setPartyErrors(e);
    if (Object.keys(e).length) { showToast("Fix errors first", "error"); return; }
    const record = { ...partyForm, id: partyForm.id||uid(), createdAt: partyForm.createdAt||today() };
    const isNew = !partyForm.id;
    try {
      const endpoint = isNew ? `${API_BASE}/parties` : `${API_BASE}/parties/${record.id}`;
      const method = isNew ? "POST" : "PUT";
      const resp = await authFetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.message || "Could not save party.");

      const saved = normalizeParty(json?.data);
      const updated = isNew ? [saved, ...parties] : parties.map(p => p.id===saved.id ? saved : p);
      setParties(updated);
      showToast(isNew ? "Party added ✓" : "Party updated ✓");
      setPartyForm(EMPTY_PARTY); setPartyErrors({});
      setView("parties");
    } catch (error) {
      showToast(error?.message || "Could not save party", "error");
    }
  };

  const deleteParty = async (id) => {
    try {
      const resp = await authFetch(`${API_BASE}/parties/${id}`, { method: "DELETE" });
      if (!resp.ok) {
        const json = await resp.json().catch(() => ({}));
        throw new Error(json?.message || "Could not delete party.");
      }
      const updated = parties.filter(p=>p.id!==id);
      setParties(updated);
      if (selectedParty?.id === id) setSelectedParty(null);
      setModal(null); setView("parties");
      showToast("Party deleted");
    } catch (error) {
      showToast(error?.message || "Could not delete party", "error");
    }
  };

  // Payment / Ledger actions
  const savePayment = async (form) => {
    const entry = { id:uid(), date:form.date, partyId:form.partyId, type:form.type, refId:"", description:form.description || `Payment – ${form.mode}`, amount:Number(form.amount), mode:form.mode, notes:form.notes, senderAccount:form.senderAccount||"", receiverAccount:form.receiverAccount||"", referenceNo:form.referenceNo||"", transactionTime:form.transactionTime||"" };
    try {
      const resp = await authFetch(`${API_BASE}/ledger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.message || "Could not save transaction.");
      setLedger(prev => [normalizeLedger(json?.data), ...prev]);
      setModal(null);
      if (selectedParty) setSelectedParty(parties.find(p=>p.id===selectedParty.id) || selectedParty);
      showToast("Transaction recorded ✓");
    } catch (error) {
      showToast(error?.message || "Could not save transaction", "error");
    }
  };

  const saveLedgerEdit = async (updatedEntry) => {
    const payload = { ...updatedEntry, amount: Number(updatedEntry.amount) };
    try {
      const resp = await authFetch(`${API_BASE}/ledger/${updatedEntry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.message || "Could not update transaction.");
      const saved = normalizeLedger(json?.data);
      setLedger(prev => prev.map(e => e.id === saved.id ? saved : e));
      setEditingLedger(null);
      showToast("Transaction updated ✓");
    } catch (error) {
      showToast(error?.message || "Could not update transaction", "error");
    }
  };

  const deleteLedgerEntry = async (entry) => {
    if (!entry?.id) return;
    const ok = window.confirm(`Delete this ledger line?\n\n${entry.date} — ${entry.description || entry.type}\n₹${fmt(entry.amount)}`);
    if (!ok) return;
    try {
      const resp = await authFetch(`${API_BASE}/ledger/${entry.id}`, { method: "DELETE" });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.message || "Could not delete transaction.");
      setLedger(prev => prev.filter(e => e.id !== entry.id));
      if (editingLedger?.id === entry.id) setEditingLedger(null);
      showToast("Transaction deleted");
    } catch (error) {
      showToast(error?.message || "Could not delete transaction", "error");
    }
  };

  // Undo
  const handleUndo = async () => {
    if (!undoStack.length) return;
    const last = undoStack[undoStack.length-1];
    if (last.type === "booking") {
      try {
        const resp = await authFetch(`${API_BASE}/bookings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toServerBooking(last.data)),
        });
        const json = await resp.json();
        if (resp.ok) {
          setBookings([normalizeBooking(json?.data), ...bookings]);
        } else {
          throw new Error(json?.message || "Undo failed.");
        }
      } catch (error) {
        showToast(error?.message || "Undo failed", "error");
        return;
      }
    }
    setUndoStack(prev=>prev.slice(0,-1));
    showToast("Restored ✓");
  };

  // Navigation
  const goNewBooking = (prePartyId="") => { setBookingForm({ ...EMPTY_BOOKING, partyId: prePartyId }); setBookingErrors({}); setView("booking-form"); };
  const goEditBooking = (b) => { setBookingForm({...b}); setBookingErrors({}); setView("booking-form"); };
  const goViewBooking = (b) => { setSelectedBooking(b); setView("booking-detail"); };
  const goNewParty = () => { setPartyForm(EMPTY_PARTY); setPartyErrors({}); setView("party-form"); };
  const goEditParty = (p) => { setPartyForm({...p}); setPartyErrors({}); setView("party-form"); };
  const goViewParty = (p) => { setSelectedParty(p); setView("party-detail"); };
  const openPayment = (party) => { setPaymentDefaultParty(party?.id||""); setModal("payment"); };
  const openGenerateReport = (type, items, partiesArg, ledgerArg, bookingsArg) => {
    setReportConfig({ type, items, parties: partiesArg || parties, ledger: ledgerArg || ledger, bookings: bookingsArg || bookings });
    setModal("report");
  };

  // Active nav detection
  const navViews = { dashboard: ["dashboard"], bookings: ["bookings","booking-form","booking-detail","explore-bookings"], parties: ["parties","party-form","party-detail","explore-parties"] };
  const getNavClass = (section) => navViews[section]?.includes(view) ? " active" : "";

  return (
    <>
      <style>{CSS}</style>
      <nav className="nav">
        <div className="nav-brand"> <span>{reportHeader.agencyName || "skyledger"}</span></div>
        {[["dashboard","Dashboard"],["bookings","Bookings"],["parties","Parties"]].map(([v,label]) => (
          <button key={v} className={`nav-btn${getNavClass(v)}`} onClick={() => setView(v)}>{label}</button>
        ))}
        <div className="nav-spacer" />
        <div className="profile-wrap" ref={profileRef}>
          <input
            ref={photoInputRef}
            className="profile-file"
            type="file"
            accept="image/*"
            onChange={(e) => handlePhotoSelected(e.target.files?.[0])}
          />
          <button
            type="button"
            className="profile-btn"
            title="Profile"
            onClick={() => setProfileOpen((v) => !v)}
          >
            {profilePhoto ? (
              <img className="profile-avatar" src={profilePhoto} alt="Profile" />
            ) : (
              <span className="profile-fallback">ME</span>
            )}
          </button>
          {profileOpen && (
            <div className="profile-menu">
              <div className="profile-head">
                <div className="profile-name">{auth.currentUser?.displayName || "My profile"}</div>
                <div className="profile-sub">{auth.currentUser?.email || userId || ""}</div>
              </div>
              <button type="button" className="profile-item" onClick={openProfile}>
                <span style={{ width: 18, opacity: 0.8 }}>👤</span> Profile
              </button>
              <button
                type="button"
                className="profile-item danger"
                onClick={async () => {
                  try {
                    await signOut(auth);
                  } finally {
                    setProfileOpen(false);
                    navigate("/login");
                  }
                }}
              >
                <span style={{ width: 18, opacity: 0.85 }}>⎋</span> Logout
              </button>
            </div>
          )}
        </div>
      </nav>

      <div className="main">
        {!userId ? (
          <div style={{ padding: 24, color: "var(--muted)", fontSize: 14 }}>Loading your workspace…</div>
        ) : (
          <>
        {view === "dashboard" && (
          <Dashboard bookings={bookings} parties={parties} ledger={ledger} stats={stats}
            onCardClick={goViewBooking} onViewAll={() => setView("bookings")} onViewAllParties={() => setView("parties")} onNew={goNewBooking}
            onViewParty={goViewParty} onExploreBookings={() => setView("explore-bookings")} onExploreParties={() => setView("explore-parties")}
          />
        )}
        {view === "explore-bookings" && (
          <ExploreBookings bookings={bookings} parties={parties} onBack={() => setView("dashboard")} />
        )}
        {view === "explore-parties" && (
          <ExploreParties parties={parties} bookings={bookings} ledger={ledger} onBack={() => setView("dashboard")} />
        )}
        {view === "bookings" && (
          <BookingsList bookings={bookings} parties={parties} onCardClick={goViewBooking} onNew={goNewBooking} onGenerateReport={openGenerateReport} />
        )}
        {view === "booking-form" && (
          <BookingForm form={bookingForm} setForm={setBookingForm} errors={bookingErrors} parties={parties}
            onSave={saveBooking} onCancel={() => setView(bookingForm.id ? "booking-detail" : "bookings")}
            onDelete={id => { setDeleteTarget(id); setModal("delete-booking"); }}
            scraping={scraping} onTicketDrop={handleTicketDrop}
          />
        )}
        {view === "booking-detail" && (
          <BookingDetail booking={selectedBooking} parties={parties}
            onBack={() => setView("bookings")} onEdit={goEditBooking}
            onDelete={id => { setDeleteTarget(id); setModal("delete-booking"); }}
          />
        )}
        {view === "parties" && (
          <PartiesList parties={parties} ledger={ledger} bookings={bookings} onSelect={goViewParty} onNew={goNewParty} onGenerateReport={openGenerateReport} />
        )}
        {view === "party-form" && (
          <PartyForm form={partyForm} setForm={setPartyForm} errors={partyErrors} onSave={saveParty} onCancel={() => setView("parties")} />
        )}
        {view === "party-detail" && (
          <PartyDetail party={selectedParty} ledger={ledger} bookings={bookings} parties={parties}
            onBack={() => setView("parties")} onEdit={goEditParty}
            onDelete={id => { setDeleteTarget(id); setModal("delete-party"); }}
            onAddPayment={openPayment} onAddBooking={(pid) => goNewBooking(pid)}
            onEditLedger={(entry) => setEditingLedger(entry)}
            onDeleteLedger={deleteLedgerEntry}
            onGenerateReport={openGenerateReport}
          />
        )}
          </>
        )}
      </div>

      {/* Delete Booking Modal */}
      {modal === "delete-booking" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Delete Booking?</div>
            <div className="modal-text">This removes the booking. You'll have a few seconds to undo.</div>
            <div className="modal-btns">
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => deleteBooking(deleteTarget)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Party Modal */}
      {modal === "delete-party" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Delete Party?</div>
            <div className="modal-text">This will delete the party record. Ledger entries and bookings remain.</div>
            <div className="modal-btns">
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => deleteParty(deleteTarget)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {modal === "payment" && (
        <PaymentModal parties={parties} defaultPartyId={paymentDefaultParty} onSave={savePayment} onClose={() => setModal(null)} showToast={showToast} />
      )}

      {/* Report Modal */}
      {modal === "report" && reportConfig && (
        <ReportModal {...reportConfig} header={reportHeader} onClose={() => setModal(null)} showToast={showToast} />
      )}

      {/* Profile Modal */}
      {modal === "profile" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Profile</div>
            <div className="modal-text">Manage your account settings.</div>

            <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
              <div className="fg">
                <div className="flabel">Profile photo</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: 999,
                      border: "1px solid var(--border)",
                      overflow: "hidden",
                      background: "var(--surface2)",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                    title="Profile photo"
                  >
                    {profilePhoto ? (
                      <img src={profilePhoto} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span className="profile-fallback">ME</span>
                    )}
                  </div>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={handlePickPhoto}>
                    Upload photo
                  </button>
                  {profilePhoto && (
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      onClick={() => {
                        if (!userId) return;
                        localStorage.removeItem(`profilePhoto:${userId}`);
                        setProfilePhoto("");
                        showToast("Profile photo removed");
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="pw-hint">
                  Photo is saved on this device/browser only. To sync across devices, we can add Firebase Storage.
                </div>
              </div>

              <div className="fg">
                <div className="flabel">Password</div>
                <button className="btn btn-primary btn-sm" type="button" onClick={openChangePassword}>
                  Change password
                </button>
              </div>

              <div className="fg">
                <div className="flabel">PDF report header</div>
                <div className="pw-hint">This is shown in the header of downloaded PDF reports (saved per user in MongoDB).</div>
                <div className="pw-grid">
                  <div className="fg">
                    <div className="flabel">Agency name</div>
                    <input
                      className="finput"
                      value={reportHeader.agencyName}
                      onChange={(e) => updateReportHeaderDraft({ ...reportHeader, agencyName: e.target.value })}
                      placeholder="Agency name…"
                    />
                  </div>
                  <div className="fg">
                    <div className="flabel">Address</div>
                    <input
                      className="finput"
                      value={reportHeader.address}
                      onChange={(e) => updateReportHeaderDraft({ ...reportHeader, address: e.target.value })}
                      placeholder="Address…"
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div className="fg">
                      <div className="flabel">Phone</div>
                      <input
                        className="finput"
                        value={reportHeader.phone}
                        onChange={(e) => updateReportHeaderDraft({ ...reportHeader, phone: e.target.value })}
                        placeholder="Phone…"
                      />
                    </div>
                    <div className="fg">
                      <div className="flabel">Email</div>
                      <input
                        className="finput"
                        value={reportHeader.email}
                        onChange={(e) => updateReportHeaderDraft({ ...reportHeader, email: e.target.value })}
                        placeholder="Email…"
                      />
                    </div>
                    <div className="fg">
                      <div className="flabel">GSTIN</div>
                      <input
                        className="finput"
                        value={reportHeader.gstin}
                        onChange={(e) => updateReportHeaderDraft({ ...reportHeader, gstin: e.target.value })}
                        placeholder="GSTIN…"
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      className="btn btn-primary btn-sm"
                      type="button"
                      onClick={() => persistReportHeader()}
                      disabled={savingReportHeader}
                    >
                      {savingReportHeader ? "Saving..." : "Save header"}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      disabled={savingReportHeader}
                      onClick={async () => {
                        const reset = { agencyName: "", address: "", phone: "", email: "", gstin: "" };
                        updateReportHeaderDraft(reset);
                        await persistReportHeader(reset);
                      }}
                    >
                      Reset to default
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-btns" style={{ marginTop: 18 }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {modal === "change-password" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Change password</div>
            <div className="modal-text">Set a new password for your account.</div>
            <div className="pw-grid">
              <div className="fg">
                <div className="flabel">Current password</div>
                <input
                  className="finput"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  autoFocus
                />
              </div>
              <div className="fg">
                <div className="flabel">New password</div>
                <input
                  className="finput"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                />
              </div>
              <div className="fg">
                <div className="flabel">Confirm new password</div>
                <input
                  className="finput"
                  type="password"
                  value={newPassword2}
                  onChange={(e) => setNewPassword2(e.target.value)}
                  placeholder="Re-type password"
                />
              </div>
              <div className="pw-hint">
                If you see “requires recent login”, sign out and sign in again, then retry.
              </div>
            </div>
            <div className="modal-btns" style={{ marginTop: 18 }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitChangePassword}>Update password</button>
            </div>
          </div>
        </div>
      )}

      {/* Ledger Edit Modal */}
      {editingLedger && (
        <LedgerEditModal entry={editingLedger} parties={parties} onSave={saveLedgerEdit} onClose={() => setEditingLedger(null)} />
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.msg}
          {toast.type === "warn" && undoStack.length > 0 && (
            <button className="undo-btn" onClick={handleUndo}>UNDO</button>
          )}
        </div>
      )}
    </>
  );
}
