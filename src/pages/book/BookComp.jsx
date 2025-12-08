import React from "react";
import BookList from "./BookList";
import BookView from "./BookView";
import BookReaderView from "./BookReaderView";
import { Route, Routes } from "react-router-dom";

function BookComp() {
  return (
    <div>
      <Routes>
        <Route index element={<BookList />} />
        <Route path="/" element={<BookList />} />
        <Route path="/:id" element={<BookView />} />
        <Route path="/:id/read" element={<BookReaderView />} />
      </Routes>
    </div>
  );
}

export default BookComp;
