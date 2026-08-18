// Extracted from the original frontend/src/App.jsx during the Step 4 modular split.
// Code is moved unchanged; only imports/exports were added.

import { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api.js';
import { PageHeader, EmptyState, FilterInput, MonthCalendar } from '../../components/ui.jsx';

function CalendarPage({ onDashboardChange, showToast }) {
  const [events, setEvents] = useState([]);
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [form, setForm] = useState({
    title: '',
    date: '',
    time: '',
    notes: ''
  });

  async function loadEvents() {
    try {
      const data = await apiRequest('/api/calendar');
      setEvents(data.events || []);
    } catch {
      showToast('Failed to load calendar events.');
    }
  }

  useEffect(() => {
    loadEvents();
  }, []);

  function updateForm(name, value) {
    setForm((previous) => ({
      ...previous,
      [name]: value
    }));
  }

  async function addEvent() {
    if (!form.title || !form.date) {
      showToast('Please enter event title and date.');
      return;
    }

    try {
      const data = await apiRequest('/api/calendar', {
        method: 'POST',
        body: JSON.stringify(form)
      });

      setEvents(data.events || []);
      setForm({ title: '', date: '', time: '', notes: '' });

      await onDashboardChange();
      showToast('Calendar event added.');
    } catch {
      showToast('Failed to add event.');
    }
  }

  async function deleteEvent(eventId) {
    try {
      const data = await apiRequest(`/api/calendar/${eventId}`, {
        method: 'DELETE'
      });

      setEvents(data.events || []);
      await onDashboardChange();
      showToast('Calendar event deleted.');
    } catch {
      showToast('Failed to delete event.');
    }
  }

  const markedDays = events
    .map((event) => new Date(`${event.date}T12:00:00`))
    .filter((date) =>
      !Number.isNaN(date.getTime()) &&
      date.getFullYear() === monthDate.getFullYear() &&
      date.getMonth() === monthDate.getMonth()
    )
    .map((date) => date.getDate());

  return (
    <section>
      <PageHeader
        title="Calendar"
        subtitle="Manage interviews, reminders, and job search events."
      />

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-[18px] shadow-sm">
          <MonthCalendar
            monthDate={monthDate}
            markedDays={markedDays}
            onPrev={() => setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
            onNext={() => setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
            legend="Scheduled event"
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-[18px] shadow-sm">
          <h2 className="text-[15px] font-extrabold text-slate-900">Add event</h2>
          <p className="mt-1 text-xs text-slate-400">Create an interview, reminder, or preparation task.</p>

          <div className="mt-4 grid gap-3.5">
            <FilterInput
              label="Event Title"
              value={form.title}
              onChange={(value) => updateForm('title', value)}
              placeholder="Interview with company"
            />

            <FilterInput
              label="Date"
              type="date"
              value={form.date}
              onChange={(value) => updateForm('date', value)}
            />

            <FilterInput
              label="Time"
              type="time"
              value={form.time}
              onChange={(value) => updateForm('time', value)}
            />

            <FilterInput
              label="Notes"
              value={form.notes}
              onChange={(value) => updateForm('notes', value)}
              placeholder="Meeting notes"
            />

            <button
              onClick={addEvent}
              className="rounded-[10px] bg-violet-600 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-violet-700"
            >
              Add Event
            </button>
          </div>
        </div>

      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-[18px] shadow-sm">
          <h2 className="text-[15px] font-extrabold text-slate-900">Upcoming events</h2>
          <p className="mt-1 text-xs text-slate-400">Your scheduled interviews, reminders, and job-search tasks.</p>

          <div className="mt-4 grid gap-3">
            {events.length ? (
              events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3.5"
                >
                  <div>
                    <h3 className="font-black text-slate-900">
                      {event.title}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {event.date} {event.time ? `· ${event.time}` : ''}
                    </p>
                    {event.notes && (
                      <p className="mt-1 text-sm text-slate-400">
                        {event.notes}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => deleteEvent(event.id)}
                    className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-100"
                  >
                    Delete
                  </button>
                </div>
              ))
            ) : (
              <EmptyState text="No calendar events yet." />
            )}
          </div>
      </div>
    </section>
  );
}

export {
  CalendarPage
};