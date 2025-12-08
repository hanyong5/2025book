import React from "react";
import BookComp from "./pages/book/BookComp";
import { Link, Route, Routes } from "react-router-dom";
import HomeComp from "./pages/HomeComp";

function test() {
  return (
    <div className="container mx-auto">
      <div className="flex justify-between items-center">
        <h1>2025book</h1>
        <div className="flex gap-4">
          <Link to="/">Home</Link>
          <Link to="/book">Book</Link>
        </div>
      </div>
      <Routes>
        <Route path="/" element={<HomeComp />} />
        <Route path="/book/*" element={<BookComp />} />
      </Routes>
    </div>
  );
}

export default test;
