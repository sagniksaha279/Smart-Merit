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

document.getElementById("feedbackForm").addEventListener("submit", function(e) {
    e.preventDefault();
    const feedback = document.getElementById("feedback").value;

    fetch("http://localhost:3000/submit-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback })
    })
    .then(res => res.json())
    .then(data => {
        document.getElementById("feedbackMessage").textContent = data.message;
        this.reset();
    })
    .catch(() => {
        document.getElementById("feedbackMessage").textContent = "Something went wrong. Please try again later.";
    });
});
