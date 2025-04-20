document.getElementById("trialForm").addEventListener("submit", function(e) {
    e.preventDefault();
    
    // Show loading state
    const submitBtn = this.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";
    
    const formData = new FormData(this);
    const data = Object.fromEntries(formData.entries());

    fetch("https://smart-merit.vercel.app/request-trial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(response => {
      // Show success message
      document.getElementById("successMessage").style.display = "block";
      document.getElementById("trialForm").reset();
      
      // Reset button
      submitBtn.disabled = false;
      submitBtn.textContent = "Send Request";
      
      // Hide form and show success after 3 seconds
      setTimeout(() => {
        document.getElementById("trialForm").style.display = "none";
      }, 3000);
    })
    .catch(err => {
      console.error("Request failed:", err);
      alert("Something went wrong. Please try again.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Send Request";
    });
  });
  
  // Enhance date input for better UX
  const startDateInput = document.getElementById("startDate");
  const today = new Date().toISOString().split('T')[0];
  startDateInput.min = today;
  startDateInput.value = today;
  
//how it works portion
const openButton = document.querySelectorAll('[data-htw-target]')
const closeButton = document.querySelectorAll('[data-htw-close]')
const overlay = document.getElementById('overlay')

openButton.forEach( button =>{
    button.addEventListener('click', () =>{
        const content = document.querySelector(button.dataset.htwTarget)
        openContent(content)
    })
})

overlay.addEventListener('click', (event) => {
    if (event.target === overlay) { // Ensures click is directly on the overlay
        const contentsOverlay = document.querySelectorAll('.htw-content.active')
        contentsOverlay.forEach(content => {
            closeContent(content);
        });
    }
});

closeButton.forEach( button =>{
    button.addEventListener('click', () =>{
        const content = button.closest('.htw-content')
        closeContent(content)
    })
})

function openContent(content){
    if(content==null)
        return
    content.classList.add('active')
    overlay.classList.add('active')
}

function closeContent(content){
    if(content==null)
        return
    content.classList.remove('active')
    overlay.classList.remove('active')
}

document.getElementById("feedbackForm").addEventListener("submit", function(event) {
    event.preventDefault();

    const message = document.getElementById("feedback").value;
    const API_BASE_URL = "https://smart-merit.vercel.app"; 

    fetch(`${API_BASE_URL}/submit-feedback`, { //change
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ message })
    })
    .then(response => response.json())
    .then(data => {
        alert(data.message);
        document.getElementById("feedbackForm").reset();
    })
    .catch(error => console.error("Error:", error));
});
